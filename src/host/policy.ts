import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { MAX_DURATION_MS } from '../shared/settings.ts'

/**
 * Admission inputs for one session's next warm request. Every field is
 * per-session state observed by the host; nothing here reads the clock except
 * the `now` argument so the decision stays testable.
 */
export interface WarmGateInput {
  /** Per-session setting; a disabled session never warms. */
  readonly enabled: boolean
  /** Whether a successful real agent request is available to replay. */
  readonly hasSnapshot: boolean
  /** Real agent-loop model requests currently in flight for this session. */
  readonly foregroundRequests: number
  /** Whether this session already has one warm request in flight. */
  readonly warmInFlight: boolean
  /** Agent status mirrored from `agent/status` (`running` during a live turn). */
  readonly running: boolean
  /** Top-level tool dispatches currently in flight for this session. */
  readonly toolCount: number
  /**
   * End of the idle window opened by a normally completed turn, or `undefined`
   * while no idle window is open (an active round, or a round that ended
   * abnormally and therefore never re-arms).
   */
  readonly idleDeadline: number | undefined
}

/**
 * Decide whether this session may start one warm request now.
 *
 * Warm work is admitted during a long tool wait of a live round — that phase
 * has no idle cap — and inside the idle window opened by a normally completed
 * turn while the agent is not running, so a new turn cannot keep warming
 * between its start and its first model call. A foreground model request or an
 * already in-flight warm request always preempts, and an abnormally ended round
 * opens no idle window at all.
 *
 * @param input - per-session admission state.
 * @param now - current epoch milliseconds.
 * @returns whether a warm request may start.
 */
export function mayStartWarmRequest(input: WarmGateInput, now: number): boolean {
  if (!input.enabled || !input.hasSnapshot) return false
  if (input.foregroundRequests > 0 || input.warmInFlight) return false
  if (input.running && input.toolCount > 0) return true
  if (input.running) return false
  return input.idleDeadline !== undefined && now < input.idleDeadline
}

/**
 * Build the keepalive replay of one captured request: the whole request, with
 * only the output budget pinned to the smallest value and a caller-owned signal.
 *
 * The replay always asks for a single output token. A provider SDK may raise
 * that to its own minimum — OpenAI Responses currently clamps it to 16 — so no
 * universal one-token wire limit is promised; this function never enlarges the
 * budget itself, and never touches reasoning or thinking settings.
 *
 * @param snapshot - the last successful real agent-loop request.
 * @param signal - the warm attempt's own abort signal.
 * @returns a new request object; the snapshot is never mutated.
 */
export function createWarmRequest(snapshot: GenerateOptions, signal: AbortSignal): GenerateOptions {
  return { ...snapshot, maxTokens: 1, signal }
}

/**
 * True lower bound before the next warm attempt, in milliseconds.
 *
 * A provider backoff is honoured only when it is a usable positive finite
 * number; `NaN`, `Infinity`, and non-positive values are ignored so they can
 * never become a timer delay. The bound itself is NOT capped: a provider that
 * asks for longer than the platform's largest timer delay still gets its full
 * wait, with the timer used only as an "ask again later" hint.
 *
 * @param intervalMs - the session's configured refresh interval.
 * @param retryAfterMs - provider-declared backoff from a failed attempt.
 * @returns the lower bound to wait before the next attempt.
 */
export function retryBackoffMs(intervalMs: number, retryAfterMs: number | undefined): number {
  const interval = Math.max(intervalMs, 1)
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return interval
  return Math.max(interval, retryAfterMs)
}

/**
 * Delay a timer may use for the next wake.
 *
 * Bounded to the largest timer delay: passing `NaN`, `Infinity`, or a value
 * above the platform limit to a timer would collapse to a one-millisecond hot
 * loop. The wait itself is owned by {@link retryBackoffMs}; a wake that fires
 * early must re-check the lower bound instead of warming.
 *
 * @param intervalMs - the session's configured refresh interval.
 * @param retryAfterMs - provider-declared backoff from a failed attempt.
 * @returns the bounded delay to wait before the next attempt.
 */
export function nextAttemptDelayMs(intervalMs: number, retryAfterMs: number | undefined): number {
  const interval = Math.min(Math.max(intervalMs, 1), MAX_DURATION_MS)
  return Math.min(Math.max(interval, retryBackoffMs(intervalMs, retryAfterMs)), MAX_DURATION_MS)
}
