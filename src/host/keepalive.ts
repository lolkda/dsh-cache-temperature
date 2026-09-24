import type { Context, Logger } from '@deepseek-ai/cordis'
import {
  isAgentLoopRequest,
  type GenerateOptions,
  type LlmFailure,
  type StreamChunk,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { TurnEndReason } from '@deepseek-ai/dsh-session'
import {
  KEEPALIVE_REQUEST_TIMEOUT_MS,
  MAX_DURATION_MS,
  getSessionSettings,
  type KeepaliveSettingsDocument,
  type SessionKeepaliveSettings,
} from '../shared/settings.ts'
import {
  createWarmRequest,
  mayStartWarmRequest,
  nextAttemptDelayMs,
  retryBackoffMs,
  type WarmGateInput,
} from './policy.ts'

/** One in-flight warm request, fenced by the request version it started from. */
interface WarmAttempt {
  readonly controller: AbortController
  readonly version: number
  /** Set when the plugin deliberately aborted this attempt. */
  cancelled: boolean
}

/** All keepalive state owned for one session, indexed by session id. */
interface SessionState {
  /** The session this state belongs to. */
  readonly sessionId: string
  /** Last successful real agent-loop request, replayed verbatim except budget and signal. */
  snapshot: GenerateOptions | undefined
  /** Monotonic request version; an attempt older than the current version is ignored. */
  version: number
  /** Whether a round is open; an abnormally ended round stays closed until the next success. */
  roundOpen: boolean
  /** Agent status mirrored from `agent/status`. */
  running: boolean
  /** Top-level tool dispatches currently in flight for this session. */
  toolCount: number
  /** Real agent-loop model requests currently in flight for this session. */
  foregroundRequests: number
  /** When the idle window opened (normal turn completion), or `undefined` while none is open. */
  idleStartedAt: number | undefined
  /** When the last real request or warm attempt settled; the refresh cadence anchor. */
  lastRefreshAt: number | undefined
  /**
   * Hard lower bound for the next warm attempt. A provider backoff outlives
   * every later re-planning decision, so no scheduling path may move an attempt
   * earlier than this. Only a warm attempt that settled without a backoff, or a
   * real request the provider actually served, clears it.
   */
  nextAllowedAt: number | undefined
  /** The single warm request this session may have in flight, until it settles. */
  warm: WarmAttempt | undefined
  /** Pending admission wake, or `undefined` when nothing is scheduled. */
  timer: ReturnType<typeof setTimeout> | undefined
  /** Due time of the pending wake, so a config change can reschedule it. */
  wakeAt: number | undefined
}

/** Terminal status of one warm attempt, as reported to the host log. */
type WarmStatus = 'ok' | 'failed' | 'aborted' | 'stale' | 'cancelled'

/** Outcome of one warm attempt. */
interface WarmOutcome {
  readonly status: WarmStatus
  readonly failure: LlmFailure | undefined
  readonly cancelled: boolean
}

/**
 * The controller's read face over the live keepalive document.
 *
 * The rc.1 Loader owns the plugin's `Config`, so the controller never registers
 * a settings namespace: the plugin hands it a reader over the resolved
 * document, and the Loader announces volatile commits separately.
 */
export interface SettingsSource {
  /** @returns the current resolved document; never mutated by the controller. */
  get(): KeepaliveSettingsDocument
}

/**
 * Per-session prompt-cache keepalive scheduling.
 *
 * The controller owns every timer and request the plugin issues. It never
 * appends to a session log, never dispatches a tool, and never drives an agent
 * turn: a warm cycle only replays the last successful real agent request with
 * the smallest output budget it can ask for and its own abort signal. The
 * provider SDK may raise that budget to its own minimum, which is accepted.
 */
export class KeepaliveController {
  private readonly ctx: Context
  private readonly source: SettingsSource
  private readonly logger: Logger
  private readonly sessions = new Map<string, SessionState>()
  private readonly ownRequests = new WeakSet<GenerateOptions>()
  private disposed = false

  constructor(ctx: Context, source: SettingsSource) {
    this.ctx = ctx
    this.source = source
    this.logger = ctx.logger('cache-temperature')
  }

  /**
   * Observe one model call. Real agent-loop requests preempt warm work
   * immediately, and a normally completed one becomes the next replay source.
   *
   * @param options - the request offered to the `llm/stream` waterfall.
   * @param next - downstream chain producing the model chunk stream.
   * @returns the chunk stream, or the untouched downstream stream.
   */
  handleStream(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    if (this.disposed || !isAgentLoopRequest(options) || this.ownRequests.has(options)) return next()
    const sessionId = options.sessionId
    if (sessionId === undefined) return next()
    const state = this.stateFor(String(sessionId))
    state.foregroundRequests += 1
    state.version += 1
    state.roundOpen = true
    state.idleStartedAt = undefined
    this.cancelWarm(state, 'foreground')
    this.plan(state)
    const onAbort = (): void => {
      state.roundOpen = false
      state.idleStartedAt = undefined
      this.cancelWarm(state, 'cancelled')
      this.plan(state)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    let stream: AsyncIterable<StreamChunk>
    try {
      stream = next()
    } catch (error) {
      options.signal?.removeEventListener('abort', onAbort)
      state.foregroundRequests -= 1
      throw error
    }
    return this.observeRealRequest(state, options, stream, onAbort)
  }

  /**
   * Observe one tool dispatch so a long tool wait stays warmable, and so the
   * wait has no idle cap. The cancellation listener is removed with the
   * dispatch, so a later signal cleanup cannot read as a user stop.
   *
   * @param exec - the allowed call about to dispatch.
   * @param next - downstream dispatch chain.
   * @returns the dispatch result.
   */
  async handleTool(
    exec: ToolDispatchExecution,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> {
    const sessionId = exec.agent?.id
    if (this.disposed || sessionId === undefined || exec.parent !== undefined) return next()
    const state = this.stateFor(String(sessionId))
    state.toolCount += 1
    const onAbort = (): void => {
      state.roundOpen = false
      state.idleStartedAt = undefined
      this.cancelWarm(state, 'cancelled')
      this.plan(state)
    }
    exec.signal.addEventListener('abort', onAbort, { once: true })
    this.plan(state)
    try {
      return await next()
    } finally {
      exec.signal.removeEventListener('abort', onAbort)
      state.toolCount -= 1
      this.plan(state)
    }
  }

  /**
   * Mirror an `agent/status` transition. Running status alone never cancels
   * warm work; it only closes the idle window to new warm requests.
   *
   * @param sessionId - the session whose agent changed status.
   * @param status - the status just entered.
   */
  setStatus(sessionId: string, status: 'idle' | 'running'): void {
    if (this.disposed) return
    const state = this.stateFor(sessionId)
    state.running = status === 'running'
    this.plan(state)
  }

  /**
   * Close one turn. A normal completion opens the idle window; any other
   * reason ends the round until the next successful real request.
   *
   * @param sessionId - the session whose turn ended.
   * @param reason - the durable turn end reason.
   */
  endTurn(sessionId: string, reason: TurnEndReason): void {
    if (this.disposed) return
    const state = this.stateFor(sessionId)
    if (reason.kind === 'completed') {
      state.idleStartedAt = Date.now()
      this.plan(state)
      return
    }
    state.roundOpen = false
    state.idleStartedAt = undefined
    this.cancelWarm(state, 'round-ended')
    this.plan(state)
  }

  /** Re-evaluate every session after the settings document changed. */
  settingsChanged(): void {
    if (this.disposed) return
    for (const state of this.sessions.values()) {
      const settings = this.settingsFor(state.sessionId)
      if (settings === undefined || !settings.enabled) this.cancelWarm(state, 'disabled')
      this.plan(state)
    }
  }

  /** Forget one session whose agent or session left the runtime. */
  dropSession(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state === undefined) return
    this.cancelWarm(state, 'session-disposed')
    this.stopTimer(state)
    this.sessions.delete(sessionId)
  }

  /** Cancel every timer and in-flight warm request; late results are ignored. */
  dispose(): void {
    this.disposed = true
    for (const state of this.sessions.values()) {
      this.cancelWarm(state, 'disposed')
      this.stopTimer(state)
    }
    this.sessions.clear()
  }

  private stateFor(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created: SessionState = {
      sessionId,
      snapshot: undefined,
      version: 0,
      roundOpen: false,
      running: false,
      toolCount: 0,
      foregroundRequests: 0,
      idleStartedAt: undefined,
      lastRefreshAt: undefined,
      nextAllowedAt: undefined,
      warm: undefined,
      timer: undefined,
      wakeAt: undefined,
    }
    this.sessions.set(sessionId, created)
    return created
  }

  /**
   * Read one session's settings. An unreadable document degrades the feature to
   * off for that session and is reported, but never breaks a real request.
   */
  private settingsFor(sessionId: string): SessionKeepaliveSettings | undefined {
    try {
      return getSessionSettings(this.source.get(), sessionId)
    } catch (error) {
      this.logger.error(
        'keepalive settings unavailable session=%s error=%s',
        sessionId,
        error instanceof Error ? error.message : String(error),
      )
      return undefined
    }
  }

  private async *observeRealRequest(
    state: SessionState,
    options: GenerateOptions,
    stream: AsyncIterable<StreamChunk>,
    onAbort: () => void,
  ): AsyncIterable<StreamChunk> {
    let succeeded = false
    try {
      for await (const chunk of stream) {
        if (chunk.type === 'finish') {
          succeeded = chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted'
        }
        yield chunk
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
      state.foregroundRequests -= 1
      if (succeeded && state.roundOpen && options.signal?.aborted !== true) {
        state.snapshot = options
        state.version += 1
        state.lastRefreshAt = Date.now()
        // The provider served a real request, so an older backoff no longer
        // describes it; the cadence restarts from this request.
        state.nextAllowedAt = undefined
      }
      this.plan(state)
    }
  }

  /**
   * Recompute the next wake from the session's anchors: the refresh cadence
   * runs from the last settled request or warm attempt, the idle window from
   * its own start, and a tool wait has no idle cap at all.
   *
   * @param state - the session state to plan for.
   * @param dueAt - an explicit next wake time, or `undefined` for the natural one.
   */
  private plan(state: SessionState, dueAt?: number): void {
    if (this.disposed || !state.roundOpen) {
      this.stopTimer(state)
      return
    }
    const settings = this.settingsFor(state.sessionId)
    if (settings === undefined || !settings.enabled || state.snapshot === undefined) {
      this.stopTimer(state)
      return
    }
    const now = Date.now()
    const toolWait = state.running && state.toolCount > 0
    const deadline = state.idleStartedAt === undefined
      ? undefined
      : state.idleStartedAt + settings.idleTimeoutMs
    const idleOpen = !state.running && deadline !== undefined && now < deadline
    if (!toolWait && !idleOpen) {
      this.cancelWarm(state, 'window-closed')
      this.stopTimer(state)
      return
    }
    const natural = (state.lastRefreshAt ?? now) + settings.intervalMs
    const target = Math.max(dueAt ?? natural, state.nextAllowedAt ?? 0)
    if (!toolWait && deadline !== undefined && target >= deadline) {
      // The next permitted attempt falls outside the idle window, so this
      // session stops warming instead of waking before it is allowed.
      this.cancelWarm(state, 'window-closed')
      this.stopTimer(state)
      return
    }
    this.scheduleAt(state, Math.max(target, now), settings.intervalMs)
  }

  private scheduleAt(state: SessionState, dueAt: number, intervalMs: number): void {
    if (state.timer !== undefined) {
      if (state.wakeAt === dueAt) return
      this.stopTimer(state)
    }
    const now = Date.now()
    const due = Number.isFinite(dueAt) ? dueAt : now + intervalMs
    state.wakeAt = due
    state.timer = setTimeout(() => {
      state.timer = undefined
      state.wakeAt = undefined
      // A wake is fire-and-forget by design; report its failure instead of
      // letting it surface as an unhandled rejection.
      void this.wake(state).catch((error: unknown) => {
        this.logger.error(
          'warm wake failed session=%s error=%s',
          state.sessionId,
          error instanceof Error ? error.message : String(error),
        )
      })
    }, Math.min(Math.max(due - now, 0), MAX_DURATION_MS))
  }

  private async wake(state: SessionState): Promise<void> {
    if (this.disposed) return
    const settings = this.settingsFor(state.sessionId)
    if (settings === undefined) {
      this.stopTimer(state)
      return
    }
    const now = Date.now()
    if (state.nextAllowedAt !== undefined && now < state.nextAllowedAt) {
      // A provider backoff is still running: re-plan without warming.
      this.plan(state)
      return
    }
    if (mayStartWarmRequest(this.gateFor(state, settings), now)) {
      const attempt = this.warm(state, settings)
      this.guardIdleDeadline(state, settings)
      const outcome = await attempt
      if (this.disposed) return
      if (outcome.status === 'stale' || outcome.cancelled) return
      const delay = outcome.status === 'failed'
        ? nextAttemptDelayMs(settings.intervalMs, outcome.failure?.providerRetryAfterMs)
        : settings.intervalMs
      this.plan(state, Date.now() + delay)
      return
    }
    this.plan(state, now + settings.intervalMs)
  }

  /**
   * Keep a wake scheduled for the end of the idle window while a warm request
   * is in flight, so the attempt is cancelled exactly when the window closes
   * instead of running until its own request timeout.
   *
   * @param state - the session whose attempt is in flight.
   * @param settings - the session's resolved settings.
   */
  private guardIdleDeadline(state: SessionState, settings: SessionKeepaliveSettings): void {
    if (state.running || state.idleStartedAt === undefined) return
    const deadline = state.idleStartedAt + settings.idleTimeoutMs
    this.scheduleAt(state, Math.max(deadline, Date.now()), settings.intervalMs)
  }

  private gateFor(state: SessionState, settings: SessionKeepaliveSettings): WarmGateInput {
    return {
      enabled: settings.enabled,
      hasSnapshot: state.snapshot !== undefined,
      foregroundRequests: state.foregroundRequests,
      warmInFlight: state.warm !== undefined,
      running: state.running,
      toolCount: state.toolCount,
      idleDeadline: state.idleStartedAt === undefined
        ? undefined
        : state.idleStartedAt + settings.idleTimeoutMs,
    }
  }

  /**
   * Issue one warm request and report how it settled.
   *
   * @param state - the session state that owns the attempt.
   * @returns the attempt outcome, including the provider backoff it asked for.
   */
  private async warm(state: SessionState, settings: SessionKeepaliveSettings): Promise<WarmOutcome> {
    const snapshot = state.snapshot
    if (snapshot === undefined) return { status: 'failed', failure: undefined, cancelled: false }
    const version = state.version
    const attempt: WarmAttempt = { controller: new AbortController(), version, cancelled: false }
    // The user-approved per-attempt timeout. Idle-window expiry, a user stop,
    // and a foreground request all preempt this attempt earlier than that.
    const timeout = setTimeout(() => attempt.controller.abort(), KEEPALIVE_REQUEST_TIMEOUT_MS)
    state.warm = attempt
    const startedAt = Date.now()
    let request: GenerateOptions | undefined
    let route = 'unknown'
    let failure: LlmFailure | undefined
    let usage: TokenUsage | undefined
    let finishedNormally = false
    try {
      request = createWarmRequest(snapshot, attempt.controller.signal)
      this.ownRequests.add(request)
      route = `${request.provider}/${request.model}`
      this.logger.info('warm start session=%s route=%s', state.sessionId, route)
      for await (const chunk of this.ctx.llm.stream(request)) {
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type !== 'finish') continue
        if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') failure = chunk.reason.failure
        else finishedNormally = true
      }
    } catch (error) {
      failure ??= {
        message: error instanceof Error ? error.message : 'keepalive request failed',
        code: 'keepalive-request-failed',
      }
    } finally {
      clearTimeout(timeout)
      if (request !== undefined) this.ownRequests.delete(request)
      if (state.warm === attempt) state.warm = undefined
    }
    const aborted = attempt.controller.signal.aborted
    const status: WarmStatus = this.disposed || state.version !== version
      ? 'stale'
      : attempt.cancelled
        ? 'cancelled'
        : failure !== undefined
          ? (aborted ? 'aborted' : 'failed')
          : (finishedNormally && !aborted ? 'ok' : 'failed')
    const elapsedMs = Date.now() - startedAt
    if (status === 'ok' || status === 'aborted') {
      state.nextAllowedAt = undefined
    } else if (status === 'failed') {
      state.nextAllowedAt = Date.now() + retryBackoffMs(settings.intervalMs, failure?.providerRetryAfterMs)
    }
    if (status === 'ok') {
      state.lastRefreshAt = Date.now()
      this.logger.info(
        'warm finish session=%s route=%s status=ok ms=%d input=%d output=%d cacheRead=%d cacheWrite=%d',
        state.sessionId,
        route,
        elapsedMs,
        usage?.inputTokens ?? 0,
        usage?.outputTokens ?? 0,
        usage?.cacheReadTokens ?? 0,
        usage?.cacheWriteTokens ?? 0,
      )
    } else if (status === 'failed' || status === 'aborted') {
      state.lastRefreshAt = Date.now()
      this.logger.warn(
        'warm error session=%s route=%s status=%s code=%s ms=%d',
        state.sessionId,
        route,
        status,
        failure?.code ?? 'no-terminal-finish',
        elapsedMs,
      )
    } else {
      this.logger.debug('warm %s session=%s route=%s status=%s ms=%d', 'discarded', state.sessionId, route, status, elapsedMs)
    }
    return { status, failure, cancelled: attempt.cancelled }
  }

  private cancelWarm(state: SessionState, reason: string): void {
    const attempt = state.warm
    if (attempt === undefined || attempt.cancelled) return
    attempt.cancelled = true
    this.logger.debug('warm cancel session=%s reason=%s', state.sessionId, reason)
    attempt.controller.abort()
  }

  private stopTimer(state: SessionState): void {
    if (state.timer === undefined) return
    clearTimeout(state.timer)
    state.timer = undefined
    state.wakeAt = undefined
  }
}
