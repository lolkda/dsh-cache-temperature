import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  createUserMessage,
  isAgentLoopRequest,
  type GenerateOptions,
  type LlmFailure,
  type StreamChunk,
  type UserMessage,
} from '@deepseek-ai/dsh-llm'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import AgentRegistry, { type Agent, type AgentStatus } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import SettingsForms from '@deepseek-ai/dsh-settings'
import { expect, vi } from 'vitest'
import { SETTINGS_NAMESPACE, type SessionKeepaliveSettings } from '../../src/shared/settings.ts'
import * as hostPlugin from '../../src/host/index.ts'
import { bootProfile, type ProfileEntry, type ProfileFixture } from './profile.ts'

/** Two distinct sessions, so every isolation assertion names a real identity. */
export const SESSION_A = SessionId('integration-session-a')
export const SESSION_B = SessionId('integration-session-b')

/**
 * The real macrotask scheduler, captured before any test installs a fake clock.
 *
 * Host work that is not driven by timers — the Loader's profile-document
 * writes, for one — completes on the real event loop, so a wait for it must
 * yield a real turn instead of advancing a fake clock.
 */
const realMacrotask = setImmediate

/** Scripted provider behaviour for one adapter call. */
export type Behavior = 'complete' | 'hang' | { readonly kind: 'fail'; readonly failure: LlmFailure }

/** One recorded provider call: exactly what the adapter received. */
export class RecordedCall {
  readonly options: GenerateOptions
  readonly behavior: Behavior
  /** Whether the request object carried the process-local agent-loop identity. */
  readonly marked: boolean
  /** Whether the outer real request was still being consumed when this call began. */
  readonly duringForegroundConsumption: boolean
  /** Whatever the caller's AsyncLocalStorage store held when this call began. */
  readonly observedStore: string | undefined
  aborted = false
  finished = false
  private released = false
  private notify: (() => void) | undefined

  constructor(
    options: GenerateOptions,
    behavior: Behavior,
    duringForegroundConsumption: boolean,
    observedStore: string | undefined,
  ) {
    this.options = options
    this.behavior = behavior
    this.marked = isAgentLoopRequest(options)
    this.duringForegroundConsumption = duringForegroundConsumption
    this.observedStore = observedStore
  }

  /** Complete a hanging call without aborting it. */
  release(): void {
    this.released = true
    this.notify?.()
  }

  /** Wait until the call is released or its own signal aborts. */
  async wait(): Promise<void> {
    if (this.released) return
    await new Promise<void>((resolve) => {
      this.notify = resolve
      this.options.signal?.addEventListener('abort', () => resolve(), { once: true })
    })
  }
}

/** Provider adapter that records every call and follows a scripted behaviour. */
export class RecordingAdapter extends LlmAdapter {
  readonly calls: RecordedCall[] = []
  /** Set by the harness so a call can record whether it began inside a foreground stream. */
  foregroundProbe: () => boolean = () => false
  /** Set by a test to observe the async context a call began in. */
  storeProbe: () => string | undefined = () => undefined
  private readonly script: Behavior[] = []

  /** Queue the behaviours of the next adapter calls; unscripted calls complete. */
  scriptCalls(...behaviors: Behavior[]): void {
    this.script.push(...behaviors)
  }

  override providerInfo(provider: string): { id: string; name: string } {
    return { id: provider, name: provider }
  }

  override async resolveModel(
    provider: string,
    model: string,
  ): Promise<{ provider: string; id: string; name: string }> {
    return { provider, id: model, name: model }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const behavior = this.script.shift() ?? 'complete'
    const call = new RecordedCall(options, behavior, this.foregroundProbe(), this.storeProbe())
    this.calls.push(call)
    if (behavior === 'hang') {
      await call.wait()
      if (options.signal?.aborted === true) {
        call.aborted = true
        call.finished = true
        yield abortedFinish()
        return
      }
    }
    call.finished = true
    if (typeof behavior === 'object') {
      yield { type: 'finish', reason: { kind: 'error', failure: behavior.failure } }
      return
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Terminal chunk for a warm request the plugin cancelled. */
function abortedFinish(): StreamChunk {
  return {
    type: 'finish',
    reason: { kind: 'aborted', failure: { message: 'aborted', code: 'aborted' } },
  }
}

/** One real agent turn the loop is driving, alongside its next idle transition. */
export interface StartedTurn {
  readonly agent: Agent
  /** Resolves once the loop reaches idle after this turn. */
  readonly idle: Promise<void>
}

/** Every observable side effect the plugin could produce, counted at the real events. */
export interface SideEffectCounters {
  sessionEvents: number
  agentStatuses: number
  toolDispatches: number
  toolResults: number
}

/** The real plugin entry this harness composes, overridable by the built-artifact tests. */
export interface MountOptions {
  readonly plugin?: unknown
  /** Legacy `settings.yaml` body the Host imports into the profile during startup. */
  readonly legacySettings?: string
}

/**
 * Real profile runtime with the Host plugin mounted as a Loader entry.
 *
 * The Loader, configuration editor, settings forms, model runtime, tool
 * runtime, and the agent stack are the deployment's own implementations; only
 * the provider adapter is scripted, so no test reaches a real model. The Host
 * plugin is composed exactly as the shipped bundle patch composes it, under the
 * entry id that is also its settings namespace.
 */
export class IntegrationHarness {
  readonly ctx: Context
  readonly adapter = new RecordingAdapter()
  readonly counters: SideEffectCounters = {
    sessionEvents: 0,
    agentStatuses: 0,
    toolDispatches: 0,
    toolResults: 0,
  }
  /** True while a foreground real request's chunk stream is being consumed. */
  consumingForeground = false
  private readonly fixture: ProfileFixture
  private fakeTimers = false

  private constructor(fixture: ProfileFixture) {
    this.fixture = fixture
    this.ctx = fixture.ctx
  }

  /** Boot the real profile, then compose every entry the plugin needs. */
  static async mount(options: MountOptions = {}): Promise<IntegrationHarness> {
    const entries: ProfileEntry[] = [
      { id: 'config-editor', name: 'editor', plugin: ConfigEditor },
      { id: 'settings', name: 'settings', plugin: SettingsForms },
      { id: 'system-prompt', name: 'system-prompt', plugin: SystemPrompt },
      { id: 'llm', name: 'llm', plugin: LlmRuntime },
      { id: 'tools', name: 'tools', plugin: ToolRuntime },
      { id: 'sessions', name: 'sessions', plugin: SessionStore },
      { id: 'agents', name: 'agents', plugin: AgentRegistry },
      { id: 'session-projections', name: 'session-projections', plugin: SessionProjectionRegistry },
      { id: 'agent-loop', name: 'agent-loop', plugin: AgentLoop, config: { agents: [] } },
      { id: SETTINGS_NAMESPACE, name: 'cache-keepalive', plugin: options.plugin ?? hostPlugin },
    ]
    const fixture = await bootProfile({
      entries,
      ...options.legacySettings === undefined ? {} : { legacySettings: options.legacySettings },
    })
    const harness = new IntegrationHarness(fixture)
    harness.adapter.foregroundProbe = () => harness.consumingForeground
    harness.ctx.llm.registerAdapter(['stub'], harness.adapter)
    // Registered after the plugin, so this listener sits downstream of it and
    // observes the real request's consumption exactly as the provider does.
    harness.ctx.on('llm/stream', (options, next) => {
      if (!isAgentLoopRequest(options)) return next()
      return harness.consumeForeground(next())
    })
    harness.ctx.on('session/event', () => {
      harness.counters.sessionEvents += 1
    })
    harness.ctx.on('agent/status', () => {
      harness.counters.agentStatuses += 1
    })
    harness.ctx.on('tools/execute', (_exec, next) => {
      harness.counters.toolDispatches += 1
      return next()
    })
    harness.ctx.on('tools/result', () => {
      harness.counters.toolResults += 1
    })
    await harness.settle()
    return harness
  }

  /**
   * Wrap one real request's chunk stream, recording that a foreground request
   * is being consumed for as long as the provider's stream is iterated.
   * @param stream - the downstream stream this harness observes.
   * @returns the same chunks, with the foreground window marked around them.
   */
  private async *consumeForeground(stream: AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    this.consumingForeground = true
    try {
      yield* stream
    } finally {
      this.consumingForeground = false
    }
  }

  /** Unload the plugin entry, as a plugin unload or HMR reload would. */
  async unloadPlugin(): Promise<void> {
    await this.fixture.setEntryDisabled(SETTINGS_NAMESPACE, true)
    await this.settle()
  }

  /** Mount the plugin entry again, as a reload would. */
  async mountPlugin(): Promise<void> {
    await this.fixture.setEntryDisabled(SETTINGS_NAMESPACE, false)
    await this.settle()
  }

  /** The profile patch document as the Host persisted it. */
  patchDocument(): string {
    return this.fixture.patchDocument()
  }

  /** The temporary Harness home this runtime owns. */
  get home(): string {
    return this.fixture.home
  }

  /**
   * Let pending microtasks, faked timers, and real Host I/O settle.
   *
   * A faked clock alone cannot complete work that the Host runs on the real
   * event loop, so a fake-clock settle also yields one real macrotask turn.
   */
  async settle(): Promise<void> {
    if (this.fakeTimers) {
      await vi.advanceTimersByTimeAsync(0)
      await new Promise<void>((resolve) => {
        realMacrotask(resolve)
      })
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

  /** Advance a faked clock and let everything it scheduled settle. */
  async advance(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms)
  }

  /** Write one session field the way the client's control does. */
  async writeSessionField(
    sessionId: string,
    field: keyof SessionKeepaliveSettings,
    value: unknown,
  ): Promise<void> {
    const revision = this.namespaceRevision()
    await this.ctx.settings.mutate(
      SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['sessions', sessionId, field], value }],
      revision,
    )
    await this.settle()
  }

  /** The namespace's resolved value, as a settings reader sees it. */
  storedSection(): unknown {
    return this.descriptor()?.value
  }

  /** The raw user layer of this plugin's namespace, or undefined while unregistered. */
  userSection(): unknown {
    return this.descriptor()?.user
  }

  /** Whether the plugin's namespace is currently served to settings clients. */
  namespaceRegistered(): boolean {
    return this.descriptor() !== undefined
  }

  /** Current revision of the plugin's namespace, or undefined while unregistered. */
  namespaceRevision(): number | undefined {
    return this.descriptor()?.revision
  }

  /** The configuration schema the Host serves for this plugin's entry. */
  namespaceSchema(): unknown {
    return this.descriptor()?.schema
  }

  /** Whether the Host would auto-generate a settings page for this entry. */
  namespaceAutoGenerate(): boolean | undefined {
    return this.descriptor()?.autoGenerate
  }

  /** The settings descriptor the Host serves for this plugin's entry. */
  private descriptor(): {
    value: unknown
    user?: unknown
    revision: number
    schema: unknown
    autoGenerate: boolean
  } | undefined {
    return this.ctx.settings.describe().find(row => row.ns === SETTINGS_NAMESPACE)
  }

  /** Mirror an `agent/status` transition. */
  emitStatus(sessionId: SessionId, status: AgentStatus): void {
    this.ctx.emit('agent/status', { agent: this.agentFor(sessionId), status })
  }

  /**
   * Start one whole real agent turn without waiting for it.
   *
   * The request the model runtime sees is the loop's own, so the agent-loop
   * identity, the `turn/end` append, and the status transitions are all the
   * deployment's rather than a harness stand-in.
   * @param sessionId - the session to drive.
   * @param text - user message the turn carries.
   * @returns the live Agent and the promise of its next idle transition.
   */
  async startTurn(sessionId: SessionId, text = `hello ${sessionId}`): Promise<StartedTurn> {
    const agent = await this.agentLoopAgent(sessionId)
    const idle = this.nextIdle(agent)
    agent.followup(userMessage(text))
    return { agent, idle }
  }

  /** Run one whole real agent turn and wait for the loop to go idle. */
  async runTurn(sessionId: SessionId, text = `hello ${sessionId}`): Promise<Agent> {
    const turn = await this.startTurn(sessionId, text)
    await turn.idle
    await this.settle()
    return turn.agent
  }

  /** Wait until the adapter has recorded `count` calls, or fail the test's own timeout. */
  async waitForCalls(count: number): Promise<void> {
    for (let attempt = 0; attempt < 200 && this.adapter.calls.length < count; attempt += 1) {
      await this.settle()
    }
  }

  /**
   * Settle until one condition holds, so asynchronous Host work is awaited by
   * its observable effect rather than by a fixed number of ticks.
   * @param condition - predicate over observable Host state.
   * @param describe - what was observed when the wait ran out, for the failure message.
   */
  async waitFor(condition: () => boolean, describe: () => string): Promise<void> {
    for (let attempt = 0; attempt < 400 && !condition(); attempt += 1) {
      await this.settle()
    }
    expect(condition(), `the awaited Host state never arrived; observed ${describe()}`).toBe(true)
  }

  /** The live agent for one session, created by the real agent loop when absent. */
  async agentLoopAgent(sessionId: SessionId): Promise<Agent> {
    const existing = this.ctx.agents.list().find(agent => agent.id === sessionId)
    if (existing !== undefined) return existing
    return this.ctx.agentLoop.create(sessionId, { provider: 'stub', model: 'stub-model' })
  }

  /** Resolve when one agent next reaches `idle`. */
  private nextIdle(agent: Agent): Promise<void> {
    return new Promise<void>((resolve) => {
      const dispose = this.ctx.on('agent/status', (payload) => {
        if (payload.agent !== agent || payload.status !== 'idle') return
        dispose()
        resolve()
      })
    })
  }

  /**
   * The live Agent the agent loop created for one session.
   *
   * The plugin reads nothing but the agent identity, so a session the loop has
   * not created yet falls back to the identity the loop would hand it.
   */
  private agentFor(sessionId: SessionId): Agent {
    const found = this.ctx.agents.list().find(agent => agent.id === sessionId)
    if (found !== undefined) return found
    return { id: sessionId } as Agent
  }

  /** Every adapter call that was a warm replay: unmarked, not foreground-initiated. */
  warmCalls(): RecordedCall[] {
    return this.adapter.calls.filter(call => !call.marked)
  }

  /** Every adapter call that was a real agent-loop request. */
  realCalls(): RecordedCall[] {
    return this.adapter.calls.filter(call => call.marked)
  }

  /** Warm replays addressed to one session. */
  warmCallsFor(sessionId: SessionId): RecordedCall[] {
    return this.warmCalls().filter(call => call.options.sessionId === sessionId)
  }

  /** Dispose the whole runtime, temporary Harness home included. */
  async dispose(): Promise<void> {
    await this.fixture.dispose()
  }
}

/** A real agent-loop user message, as the loop's own turn would carry it. */
function userMessage(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}
