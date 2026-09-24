import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_DURATION_MS } from '../../src/shared/settings.ts'
import { HostHarness, SESSION_ID } from './harness.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'

const OTHER = 'session-2' as SessionId

describe('provider backoff is a lower bound on the next warm attempt', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
    await harness.setSettings(SESSION_ID, { intervalMs: 1_000, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  /** Reject the next warm attempt with a provider backoff. */
  function scriptRateLimit(retryAfterMs: number): void {
    harness.adapter.enqueue({
      kind: 'fail',
      failure: { message: 'rate limited', code: 'rate-limited', providerRetryAfterMs: retryAfterMs },
    })
  }

  it('is reset by a successful real request', async () => {
    scriptRateLimit(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.warmCalls()).toHaveLength(1)

    // A real request the provider actually served supersedes the old backoff,
    // so the cadence runs from that request again.
    await vi.advanceTimersByTimeAsync(1_000)
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(999)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('is not shortened by another session being saved', async () => {
    scriptRateLimit(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_000)
    await harness.setSettings(OTHER, { intervalMs: 2_000 })
    await vi.advanceTimersByTimeAsync(3_999)

    expect(harness.warmCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('is not shortened by an agent status change', async () => {
    scriptRateLimit(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_000)
    harness.emitStatus('running')
    harness.emitStatus('idle')
    await vi.advanceTimersByTimeAsync(3_999)

    expect(harness.warmCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('is not shortened by a tool transition', async () => {
    scriptRateLimit(5_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.warmCalls()).toHaveLength(1)

    harness.emitStatus('running')
    const tool = harness.startTool()
    await harness.flush()
    tool.release()
    await tool.settled
    await harness.flush()
    harness.emitStatus('idle')
    await vi.advanceTimersByTimeAsync(4_999)

    expect(harness.warmCalls()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('outlives the largest timer delay instead of being woken early', async () => {
    harness.emitStatus('running')
    const tool = harness.startTool()
    await harness.flush()
    // 30 days: beyond the largest delay a Node timer accepts.
    const retryAfterMs = 2_592_000_000
    scriptRateLimit(retryAfterMs)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(MAX_DURATION_MS)
    expect(harness.warmCalls()).toHaveLength(1)

    // The capped timer woke early; the wait itself still runs to its end.
    const remaining = retryAfterMs - MAX_DURATION_MS
    await vi.advanceTimersByTimeAsync(remaining - 1)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
    tool.release()
  })
})
