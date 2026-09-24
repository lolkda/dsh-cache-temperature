import { Context, Logger, type Exporter } from '@deepseek-ai/cordis'
import { markAgentLoopRequest, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeepaliveController, type SettingsSource } from '../../src/host/keepalive.ts'

const SESSION = 'session-1' as SessionId
const INTERVAL_MS = 240_000

interface CapturedLine {
  readonly type: string
  readonly text: string
}

/** Controller over a settings source whose document can become unreadable. */
function mountController(): {
  readonly controller: KeepaliveController
  readonly logs: CapturedLine[]
  breakSettings(): void
  restoreSettings(): void
  dispose(): void
} {
  const ctx = new Context()
  const logs: CapturedLine[] = []
  const exporter: Exporter = {
    levels: { default: 3 },
    export: (message) => {
      logs.push({ type: message.type, text: Logger.format(exporter, message) })
    },
  }
  ctx.logger.exporter(exporter)
  let broken = false
  const source: SettingsSource = {
    get: () => {
      if (broken) throw new Error('settings unavailable')
      return { sessions: {} }
    },
  }
  const controller = new KeepaliveController(ctx, source)
  return {
    controller,
    logs,
    breakSettings: () => {
      broken = true
    },
    restoreSettings: () => {
      broken = false
    },
    dispose: () => {
      controller.dispose()
    },
  }
}

/** Drive one real agent-loop request through the controller's stream listener. */
async function runRequest(controller: KeepaliveController): Promise<void> {
  const options = markAgentLoopRequest(Object.freeze({
    provider: 'stub',
    model: 'stub-model',
    maxTokens: 4_096,
    messages: [],
    sessionId: SESSION,
  })) as GenerateOptions
  const stream = (): AsyncIterable<StreamChunk> => (async function* () {
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  for await (const _chunk of controller.handleStream(options, stream)) {
    // Drain the wrapped stream so the request settles.
  }
}

describe('host keepalive against an unreadable settings document', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the failure instead of raising an unhandled rejection', async () => {
    vi.useFakeTimers()
    const host = mountController()
    try {
      await runRequest(host.controller)
      host.controller.endTurn(SESSION, { kind: 'completed' })
      host.breakSettings()

      await vi.advanceTimersByTimeAsync(INTERVAL_MS)

      const errors = host.logs.filter(line => line.type === 'error')
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors[0]!.text).toContain(SESSION)
      expect(errors[0]!.text).toContain('settings unavailable')
    } finally {
      host.dispose()
    }
  })

  it('keeps a failing settings read from breaking later real requests', async () => {
    vi.useFakeTimers()
    const host = mountController()
    try {
      await runRequest(host.controller)
      host.controller.endTurn(SESSION, { kind: 'completed' })
      host.breakSettings()
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)

      await expect(runRequest(host.controller)).resolves.toBeUndefined()
      await expect(runRequest(host.controller)).resolves.toBeUndefined()
    } finally {
      host.dispose()
    }
  })

  it('recovers warming once the settings document is readable again', async () => {
    vi.useFakeTimers()
    const host = mountController()
    try {
      await runRequest(host.controller)
      host.controller.endTurn(SESSION, { kind: 'completed' })
      host.breakSettings()
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
      host.restoreSettings()

      await runRequest(host.controller)
      host.controller.endTurn(SESSION, { kind: 'completed' })
      await vi.advanceTimersByTimeAsync(INTERVAL_MS)

      const warm = host.logs.filter(line => line.text.includes('warm start'))
      expect(warm).toHaveLength(1)
    } finally {
      host.dispose()
    }
  })
})
