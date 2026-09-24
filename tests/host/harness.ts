import { Context, Logger, type Exporter, type Fiber } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  isAgentLoopRequest,
  markAgentLoopRequest,
  type GenerateOptions,
  type LlmFailure,
  type Message,
  type MessageId,
  type StreamChunk,
  type ToolCallId,
} from '@deepseek-ai/dsh-llm'
import { ToolRuntime, type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { vi } from 'vitest'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import {
  Session,
  type SessionEvent,
  type SessionId,
  type SessionSeq,
  type TurnEndReason,
} from '@deepseek-ai/dsh-session'
import type { SessionKeepaliveSettings } from '../../src/shared/settings.ts'
import {
  Config as hostConfig,
  apply as applyHostPlugin,
  inject as hostInject,
  name as hostPluginName,
} from '../../src/host/index.ts'

/**
 * A live Agent or Session cannot be constructed without the agent loop, which
 * is not a workspace dependency. Every host path exercised here reads only the
 * identity of these objects, so the harness supplies that identity alone.
 */
function agentOf(id: SessionId): Agent {
  return { id } as Agent
}

function sessionOf(id: SessionId): Session {
  return { id } as Session
}

/**
 * The shared cross-copy write protocol every `Volatile` reference implements
 * (`cosmokit` registers it with `Symbol.for` precisely so independent copies of
 * the framework agree on it). The harness uses it to replay what the Loader's
 * `_commitVolatile` does to a running fiber: commit a freshly validated
 * snapshot in place, then announce the changed paths.
 */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

interface WritableVolatile {
  [VOLATILE_WRITE](value: unknown): void
}

/**
 * A dispatch `this` carrying the Loader's fiber filter. The Loader announces a
 * volatile commit only to listeners owned by the fiber whose config changed, so
 * the harness reproduces that narrowing instead of broadcasting.
 */
interface FiberFilteredDispatch {
  [Context.filter](owner: Context): boolean
}

/** One scripted provider behaviour, consumed by the next adapter call. */
export type AdapterBehavior =
  | { readonly kind: 'complete' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'hang' }
  | { readonly kind: 'stubborn' }
  | { readonly kind: 'fail'; readonly failure: LlmFailure }
  | { readonly kind: 'throw'; readonly error: Error }

/** One recorded adapter call: what the provider actually received. */
export class RecordedCall {
  readonly options: GenerateOptions
  readonly behavior: AdapterBehavior
  readonly marked: boolean
  aborted = false
  finished = false
  private released = false
  private notify: (() => void) | undefined

  constructor(options: GenerateOptions, behavior: AdapterBehavior) {
    this.options = options
    this.behavior = behavior
    this.marked = isAgentLoopRequest(options)
  }

  /** Complete a hanging call. */
  release(): void {
    this.released = true
    this.notify?.()
  }

  /** Wait for a hang to be released, optionally also on abort. */
  waitForRelease(abortable: boolean): Promise<void> {
    if (this.released) return Promise.resolve()
    return new Promise<void>((resolve) => {
      this.notify = resolve
      if (!abortable) return
      this.options.signal?.addEventListener('abort', () => resolve(), { once: true })
    })
  }
}

/** Provider adapter that records every call and follows a scripted behaviour. */
export class StubAdapter extends LlmAdapter {
  readonly calls: RecordedCall[] = []
  private readonly behaviors: AdapterBehavior[] = []

  /** Script the behaviour of the next adapter call. */
  enqueue(behavior: AdapterBehavior): void {
    this.behaviors.push(behavior)
  }

  override providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: provider }
  }

  override async resolveModel(provider: string, model: string): Promise<{ provider: string; id: string; name: string }> {
    return { provider, id: model, name: model }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const call = new RecordedCall(options, this.behaviors.shift() ?? { kind: 'complete' })
    this.calls.push(call)
    const behavior = call.behavior
    if (behavior.kind === 'throw') {
      call.finished = true
      throw behavior.error
    }
    if (behavior.kind === 'fail') {
      call.finished = true
      yield { type: 'finish', reason: { kind: 'error', failure: behavior.failure } }
      return
    }
    if (behavior.kind === 'empty') {
      call.finished = true
      return
    }
    if (behavior.kind === 'hang' || behavior.kind === 'stubborn') {
      await call.waitForRelease(behavior.kind === 'hang')
      if (behavior.kind === 'hang' && options.signal?.aborted === true) {
        call.aborted = true
        call.finished = true
        yield {
          type: 'finish',
          reason: {
            kind: 'aborted',
            failure: { message: 'aborted', code: 'aborted' },
          },
        }
        return
      }
    }
    call.finished = true
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** A real agent-loop request started by the harness but not awaited. */
export interface StartedRequest {
  readonly options: GenerateOptions
  readonly controller: AbortController
  readonly settled: Promise<void>
}

/** A real top-level tool dispatch started by the harness but not awaited. */
export interface StartedTool {
  readonly controller: AbortController
  readonly settled: Promise<ToolExecutionResult>
  release(): void
}

/** One structured host log record captured from the real logger service. */
export interface CapturedLog {
  readonly type: string
  readonly name: string
  readonly text: string
}

/** One page-policy registration a plugin made through `ctx.settings.configure`. */
export interface RecordedPresentation {
  readonly presentation: { readonly auto?: boolean }
  readonly owner: unknown
}

/**
 * Controlled stand-in for the `settings` service. The Host only ever calls
 * `configure` on it, so the harness records the page policy and the fiber it
 * was registered against without standing up the real form projection.
 */
export class RecordingSettings {
  readonly calls: RecordedPresentation[] = []

  configure(presentation: { auto?: boolean }, owner?: unknown): () => void {
    const call: RecordedPresentation = { presentation, owner }
    this.calls.push(call)
    return () => {
      const index = this.calls.indexOf(call)
      if (index >= 0) this.calls.splice(index, 1)
    }
  }
}

/** Live agents the harness pretends were already running when the plugin mounted. */
export interface MountOptions {
  readonly liveAgents?: readonly { readonly id: SessionId; readonly status: AgentStatus }[]
  /** Raw keepalive document the Loader would resolve into the plugin's Config. */
  readonly settings?: Record<string, Partial<SessionKeepaliveSettings>>
  /** Whether a `settings` service is present, as in a full deployment. */
  readonly settingsService?: boolean
}

/** Real Cordis runtime with the host plugin mounted over scripted providers. */
export class HostHarness {
  readonly ctx: Context
  readonly adapter = new StubAdapter()
  readonly callsAtWaterfall: GenerateOptions[] = []
  readonly logs: CapturedLog[] = []
  readonly settings = new RecordingSettings()

  private toolRelease: (() => void) | undefined
  private fakeTimers = false
  private pluginFiber: (Fiber & PromiseLike<Fiber>) | undefined
  private disposed = false
  private rawSessions: Record<string, Record<string, unknown>>

  private constructor(ctx: Context, rawSessions: Record<string, Record<string, unknown>>) {
    this.ctx = ctx
    this.rawSessions = rawSessions
  }

  /**
   * Mount the real LLM runtime, the real tool runtime, then the plugin with the
   * Config schema the Loader would validate.
   */
  static async mount(options: MountOptions = {}): Promise<HostHarness> {
    const ctx = new Context()
    const rawSessions: Record<string, Record<string, unknown>> = {}
    for (const [id, patch] of Object.entries(options.settings ?? {})) rawSessions[id] = { ...patch }
    const harness = new HostHarness(ctx, rawSessions)
    if (options.liveAgents !== undefined) {
      const live = options.liveAgents
      ctx.provide('agents', { list: () => [...live] })
    }
    const exporter: Exporter = {
      levels: { default: 3 },
      export: (message) => {
        harness.logs.push({
          type: message.type,
          name: message.name,
          text: Logger.format(exporter, message),
        })
      },
    }
    ctx.logger.exporter(exporter)
    if (options.settingsService === true) ctx.provide('settings', harness.settings)
    ctx.plugin(LlmRuntime)
    // Only the prompt registry is stubbed; the tool registry, dispatch pipeline
    // and `tools/execute` waterfall below are the real implementations.
    ctx.provide('systemPrompt', {
      tools: () => () => {},
      section: () => () => {},
      getSectionOrder: () => 0,
    })
    ctx.plugin(ToolRuntime)
    await harness.flush()
    ctx.llm.registerAdapter(['stub'], harness.adapter)
    ctx.tools.register({
      name: 'slow-tool',
      description: 'waits until the harness releases it',
      parameters: {},
      output: { schema: {}, render: () => [] },
      execute: async () => {
        await new Promise<void>((resolve) => {
          harness.toolRelease = resolve
        })
        return { released: true }
      },
    })
    ctx.on('llm/stream', (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
      harness.callsAtWaterfall.push(options)
      return next()
    })
    harness.pluginFiber = ctx.plugin(
      { name: hostPluginName, inject: hostInject, Config: hostConfig, apply: applyHostPlugin },
      { sessions: harness.rawSessions },
    )
    await harness.flush()
    return harness
  }

  /** Let pending microtasks and faked timers settle. */
  async flush(): Promise<void> {
    if (this.fakeTimers) {
      await vi.advanceTimersByTimeAsync(0)
      return
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  }

  /** Install Vitest fake timers for the rest of this test. */
  useFakeTimers(): void {
    vi.useFakeTimers()
    this.fakeTimers = true
  }

  /** Restore real timers. */
  useRealTimers(): void {
    this.fakeTimers = false
    vi.useRealTimers()
  }

  /** Advance the faked clock, letting every scheduled callback settle. */
  async advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
  }

  /**
   * Commit one session's settings the way the Loader does for a volatile-only
   * change: re-validate the raw document, write the snapshot into the running
   * fiber's reference in place, then announce the changed path to this fiber
   * alone. The plugin is never remounted.
   */
  async setSettings(sessionId: SessionId, patch: Partial<SessionKeepaliveSettings>): Promise<void> {
    this.rawSessions[sessionId] = { ...this.rawSessions[sessionId], ...patch }
    this.commitVolatile()
    this.announceVolatileUpdate(true)
    await this.flush()
  }

  /**
   * Commit settings without announcing them to this plugin, which is what a
   * volatile commit belonging to some other plugin's fiber looks like.
   */
  async setSettingsFromAnotherFiber(
    sessionId: SessionId,
    patch: Partial<SessionKeepaliveSettings>,
  ): Promise<void> {
    this.rawSessions[sessionId] = { ...this.rawSessions[sessionId], ...patch }
    this.commitVolatile()
    this.announceVolatileUpdate(false)
    await this.flush()
  }

  /** The document the running plugin currently resolves, as the Host would read it. */
  settingsDocument(): Record<string, SessionKeepaliveSettings> {
    return this.liveSessions()
  }

  /** The plugin's own fiber, as the plugin sees it through `ctx.fiber`. */
  ownFiber(): Fiber {
    const fiber = this.pluginFiber
    if (fiber === undefined) throw new Error('plugin is not mounted')
    return fiber.ctx.fiber
  }

  /** Mount the settings service after the plugin, as a later-loading deployment would. */
  provideSettings(): void {
    this.ctx.provide('settings', this.settings)
  }

  private commitVolatile(): void {
    const fiber = this.pluginFiber
    if (fiber === undefined) throw new Error('plugin is not mounted')
    const resolved = hostConfig({ sessions: this.rawSessions })
    const reference = (fiber.config as { sessions: WritableVolatile }).sessions
    ;(reference as unknown as WritableVolatile)[VOLATILE_WRITE](resolved.sessions.get())
  }

  /** Announce a volatile commit with the Loader's fiber filter. */
  private announceVolatileUpdate(forThisFiber: boolean): void {
    const fiber = this.pluginFiber
    if (fiber === undefined) throw new Error('plugin is not mounted')
    // The registry hands back `Object.create(fiber)`, so the listener's owning
    // fiber is never reference-equal to it; compare the fiber's stable uid.
    const uid = fiber.uid
    const dispatch = Object.create(this.ctx) as FiberFilteredDispatch
    dispatch[Context.filter] = (owner: Context): boolean => (owner.fiber.uid === uid) === forThisFiber
    this.ctx.emit(dispatch, 'loader/volatile-update', [['sessions']])
  }

  private liveSessions(): Record<string, SessionKeepaliveSettings> {
    const fiber = this.pluginFiber
    if (fiber === undefined) throw new Error('plugin is not mounted')
    const reference = (fiber.config as { sessions: { get(): Record<string, SessionKeepaliveSettings> } }).sessions
    return reference.get()
  }

  /** Start one real agent-loop model request and drain it to completion. */
  startRequest(overrides: Partial<GenerateOptions> = {}, sessionId: SessionId = SESSION_ID): StartedRequest {
    const controller = new AbortController()
    const options = markAgentLoopRequest(Object.freeze({
      provider: 'stub',
      model: 'stub-model',
      maxTokens: 4_096,
      temperature: 0.25,
      stop: ['STOP'],
      messages: [{
        id: 'm1' as MessageId,
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
        source: { kind: 'user' },
      } satisfies Message],
      system: 'system prompt',
      tools: [{ name: 'tool', description: 'described', parameters: {} }],
      sessionId,
      signal: controller.signal,
      ...overrides,
    }))
    const settled = (async () => {
      for await (const _chunk of this.ctx.llm.stream(options)) {
        // The loop consumes chunks; the harness only needs settlement.
      }
    })()
    return { options, controller, settled }
  }

  /** Start one real agent-loop request and wait for it to settle. */
  async request(overrides: Partial<GenerateOptions> = {}, sessionId: SessionId = SESSION_ID): Promise<void> {
    const started = this.startRequest(overrides, sessionId)
    await started.settled
    await this.flush()
  }

  /** Start one real top-level tool dispatch that hangs until released. */
  startTool(sessionId: SessionId = SESSION_ID): StartedTool {
    const controller = new AbortController()
    const settled = this.ctx.tools.execute({
      callId: `call-${sessionId}` as ToolCallId,
      name: 'slow-tool',
      arguments: {},
      agent: agentOf(sessionId),
      signal: controller.signal,
    })
    return {
      controller,
      settled,
      release: () => {
        this.toolRelease?.()
      },
    }
  }

  /** Mirror an `agent/status` transition. */
  emitStatus(status: AgentStatus, sessionId: SessionId = SESSION_ID): void {
    this.ctx.emit('agent/status', { agent: agentOf(sessionId), status })
  }

  /** Mirror an `agent/disposed` publication. */
  emitAgentDisposed(sessionId: SessionId = SESSION_ID): void {
    this.ctx.emit('agent/disposed', { agent: agentOf(sessionId) })
  }

  /** Mirror a `session/disposed` publication. */
  emitSessionDisposed(sessionId: SessionId = SESSION_ID): void {
    this.ctx.emit('session/disposed', sessionOf(sessionId))
  }

  /** Mirror a durable `turn/end` append. */
  emitTurnEnd(reason: TurnEndReason, sessionId: SessionId = SESSION_ID): void {
    const event: SessionEvent<'turn/end'> = {
      type: 'turn/end',
      seq: 1 as SessionSeq,
      time: Date.now(),
      data: { turn: 1, reason },
    }
    this.ctx.emit('session/event', sessionOf(sessionId), event)
  }

  /** Adapter calls that were warm replays (unmarked, one output token). */
  warmCalls(): RecordedCall[] {
    return this.adapter.calls.filter(call => !call.marked)
  }

  /** Adapter calls that were real agent-loop requests. */
  realCalls(): RecordedCall[] {
    return this.adapter.calls.filter(call => call.marked)
  }

  /** Host log records that mention keepalive warm work. */
  warmLogs(): CapturedLog[] {
    return this.logs.filter(entry => entry.text.includes('warm'))
  }

  /** Drop every captured log record. */
  clearLogs(): void {
    this.logs.length = 0
  }

  /** Unload only the host plugin, leaving the rest of the runtime mounted. */
  async disposePlugin(): Promise<void> {
    await this.pluginFiber?.dispose()
    await this.flush()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.ctx.fiber.dispose()
  }
}

/** The session every harness helper targets by default. */
export const SESSION_ID = 'session-1' as SessionId
