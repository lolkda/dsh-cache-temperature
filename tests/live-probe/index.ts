import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-settings'
import Schema from '@deepseek-ai/schemastery'
import { isAgentLoopRequest, type GenerateOptions, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

export const name = 'cache-temperature-live-check'
export const inject = ['llm', 'settings', 'agents']
export interface Config {
  targetSessionId: string
  outputPath: string
}
export const Config: Schema<Config> = Schema.object({
  targetSessionId: Schema.string().required(),
  outputPath: Schema.string().required(),
})
const namespace = 'cache-keepalive'
const testIntervalMs = 15_000

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function row(document: unknown, id: string): { exists: boolean; value: unknown } {
  if (!record(document) || !record(document.sessions)) return { exists: false, value: undefined }
  return { exists: Object.hasOwn(document.sessions, id), value: document.sessions[id] }
}

/** Hash only; never persist the actual conversation or replay metadata. */
function fingerprint(options: GenerateOptions): string | null {
  try {
    const { signal: _signal, maxTokens: _budget, ...input } = options
    return createHash('sha256').update(JSON.stringify(input)).digest('hex')
  } catch {
    return null
  }
}

/** One temporary observer; no tools, prompts, UI, or Agent driving. */
export function apply(ctx: Context, config: Config): void {
  const agent = ctx.agents.list().find(item => String(item.id) === config.targetSessionId)
  if (agent === undefined) throw new Error('The specified live session is unavailable')
  const workspace = agent.session.header.cwd
  const output = resolve(config.outputPath)
  if (workspace === undefined || !output.startsWith(`${resolve(workspace)}${sep}`)) {
    throw new Error('Live probe output must remain inside the session workspace')
  }
  const logger = ctx.logger('cache-temperature-live-check')
  const startedAt = Date.now()
  let previous: { exists: boolean; value: unknown } = { exists: false, value: undefined }
  let configured = false
  let configuring: Promise<void> | undefined
  let finished = false
  let finishing: Promise<void> | undefined
  let latestRealHash: string | null = null
  let realRequestsObserved = 0
  let warmActive = false
  const forbiddenEvents: string[] = []
  let request: { provider: string; model: string; maxTokens: number | undefined; sameInput: boolean; messages: number } | null = null
  let terminal: string | null = null
  let failureCode: string | null = null
  let usage: TokenUsage | null = null

  const describe = () => {
    const descriptor = ctx.settings.describe({ redactSecrets: true }).find(item => String(item.ns) === namespace)
    if (descriptor === undefined) throw new Error('Keepalive settings are not registered')
    return descriptor
  }

  async function restore(): Promise<string> {
    if (!configured) return 'untouched'
    const current = describe()
    const currentRow = row(current.user, config.targetSessionId).value
    if (!record(currentRow) || currentRow.enabled !== true
      || currentRow.intervalMs !== testIntervalMs || currentRow.idleTimeoutMs !== 1_800_000) {
      return 'kept-newer-values'
    }
    const path = ['sessions', config.targetSessionId]
    await ctx.settings.mutate(namespace, previous.exists
      ? [{ op: 'set', path, value: previous.value }]
      : [{ op: 'unset', path }], current.revision)
    return 'restored'
  }

  function finish(reason: string): Promise<void> {
    if (finishing !== undefined) return finishing
    finished = true
    clearTimeout(timeout)
    finishing = (async () => {
      await configuring?.catch(() => undefined)
      let restoration = 'failed'
      try {
        restoration = await restore()
      } catch (error) {
        logger.error('restore failed: %s', error instanceof Error ? error.name : 'unknown')
      }
      const normalFinish = terminal !== null && ['stop', 'tool-calls', 'max-tokens'].includes(terminal)
      const result = {
        reason,
        startedAt,
        finishedAt: Date.now(),
        sessionId: config.targetSessionId,
        realRequestsObserved,
        request,
        terminal,
        failureCode,
        usage,
        acceptedSdkMinimum: 16,
        forbiddenEvents,
        restoration,
        passed: reason === 'observed' && normalFinish && request?.maxTokens === 1
          && request.sameInput && forbiddenEvents.length === 0 && restoration === 'restored'
          && (usage === null || usage.outputTokens <= 16),
      }
      await mkdir(dirname(output), { recursive: true })
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      logger.info('verification completed reason=%s restored=%s passed=%s', reason, restoration, result.passed)
    })()
    return finishing
  }

  async function configure(): Promise<void> {
    const current = describe()
    previous = row(current.user, config.targetSessionId)
    await ctx.settings.mutate(namespace, [
      { op: 'set', path: ['sessions', config.targetSessionId, 'enabled'], value: true },
      { op: 'set', path: ['sessions', config.targetSessionId, 'intervalMs'], value: testIntervalMs },
      { op: 'set', path: ['sessions', config.targetSessionId, 'idleTimeoutMs'], value: 1_800_000 },
    ], current.revision)
    configured = true
    logger.info('verification armed session=%s intervalMs=%d', config.targetSessionId, testIntervalMs)
  }

  const timeout = setTimeout(() => {
    void finish('timeout').catch(error => logger.error('report failed: %s', error instanceof Error ? error.name : 'unknown'))
  }, 180_000)
  ctx.effect(() => () => finish('disposed'))
  ctx.on('session/event', (session, event) => {
    if (warmActive && String(session.id) === config.targetSessionId
      && ['user/message', 'assistant/message', 'assistant/attempt', 'tool/call', 'tool/result', 'turn/start'].includes(event.type)) {
      forbiddenEvents.push(event.type)
    }
  })
  ctx.on('llm/stream', (options, next) => {
    if (finished || options.sessionId !== agent.id) return next()
    const real = isAgentLoopRequest(options)
    const warm = configured && !real && options.maxTokens === 1 && options.purpose === undefined
    if (!real && !warm) return next()
    return (async function* (): AsyncIterable<StreamChunk> {
      const hash = fingerprint(options)
      let realSucceeded = false
      if (warm) {
        warmActive = true
        request = {
          provider: options.provider,
          model: options.model,
          maxTokens: options.maxTokens,
          sameInput: latestRealHash !== null && hash === latestRealHash,
          messages: options.messages.length,
        }
      }
      try {
        for await (const chunk of next()) {
          if (chunk.type === 'finish') {
            if (real) realSucceeded = chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted'
            if (warm) {
              terminal = chunk.reason.kind
              if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') failureCode = chunk.reason.failure.code
            }
          }
          if (warm && chunk.type === 'usage') usage = chunk.usage
          yield chunk
        }
      } finally {
        if (real && realSucceeded && !finished) {
          latestRealHash = hash
          realRequestsObserved += 1
          configuring ??= configure().catch(error => {
            failureCode = error instanceof Error ? error.name : 'configuration-error'
            // Avoid awaiting finish from the configuring promise itself.
            queueMicrotask(() => { void finish('configuration-error').catch(() => undefined) })
          })
        }
        if (warm) {
          warmActive = false
          void finish('observed').catch(error => logger.error('report failed: %s', error instanceof Error ? error.name : 'unknown'))
        }
      }
    })()
  })
}
