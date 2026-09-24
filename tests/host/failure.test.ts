import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEPALIVE_REQUEST_TIMEOUT_MS } from '../../src/shared/settings.ts'
import { HostHarness, SESSION_ID } from './harness.ts'

const INTERVAL_MS = 60_000

describe('host keepalive failure handling', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
    await harness.setSettings(SESSION_ID, { intervalMs: INTERVAL_MS, idleTimeoutMs: 900_000 })
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  /** Open an idle window with a captured snapshot and one scripted provider behaviour. */
  async function armIdleSession(): Promise<void> {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
  }

  it('waits a full interval before retrying a rejected warm request', async () => {
    await armIdleSession()
    harness.adapter.enqueue({
      kind: 'fail',
      failure: { message: 'max_tokens must be greater than 1', code: 'invalid_max_tokens', status: 400 },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('never widens the one-token budget after the provider rejects it', async () => {
    await armIdleSession()
    harness.adapter.enqueue({
      kind: 'fail',
      failure: { message: 'max_tokens must be greater than 1', code: 'invalid_max_tokens', status: 400 },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(2)
    expect(warm.every(call => call.options.maxTokens === 1)).toBe(true)
    expect(warm.every(call => call.options.provider === 'stub')).toBe(true)
  })

  it('honours a provider retry-after longer than the refresh interval', async () => {
    await armIdleSession()
    harness.adapter.enqueue({
      kind: 'fail',
      failure: {
        message: 'rate limited',
        code: 'rate_limit',
        status: 429,
        providerRetryAfterMs: 300_000,
      },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(299_999)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('paces a thrown warm failure like a rejected one', async () => {
    await armIdleSession()
    harness.adapter.enqueue({ kind: 'throw', error: new Error('provider exploded') })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('aborts a warm request that outlives the keepalive request timeout', async () => {
    await armIdleSession()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    const warm = harness.warmCalls()[0]!

    await vi.advanceTimersByTimeAsync(KEEPALIVE_REQUEST_TIMEOUT_MS - 1)
    expect(warm.options.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(warm.options.signal?.aborted).toBe(true)
    await harness.flush()
    expect(warm.aborted).toBe(true)
  })

  it('keeps the next round scheduled after a superseded warm settles late', async () => {
    await armIdleSession()
    harness.adapter.enqueue({ kind: 'hang' })
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    const superseded = harness.warmCalls()[0]!

    const next = harness.startRequest()
    await next.settled
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(2)
    expect(superseded.options.signal?.aborted).toBe(true)
    expect(warm[1]!.options.signal?.aborted).toBe(false)
  })

  it('ignores an infinite provider retry-after instead of hot-looping the timer', async () => {
    await armIdleSession()
    harness.adapter.enqueue({
      kind: 'fail',
      failure: {
        message: 'unknown backoff',
        code: 'rate_limit',
        providerRetryAfterMs: Number.POSITIVE_INFINITY,
      },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(harness.warmCalls().length).toBeGreaterThanOrEqual(2)
    expect(harness.warmCalls().length).toBeLessThanOrEqual(4)
  })

  it('ignores a NaN provider retry-after instead of hot-looping the timer', async () => {
    await armIdleSession()
    harness.adapter.enqueue({
      kind: 'fail',
      failure: { message: 'unknown backoff', code: 'rate_limit', providerRetryAfterMs: Number.NaN },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(harness.warmCalls().length).toBeGreaterThanOrEqual(2)
    expect(harness.warmCalls().length).toBeLessThanOrEqual(4)
  })

  it('cancels timers and in-flight warm work when the plugin unloads', async () => {
    await armIdleSession()
    harness.adapter.enqueue({ kind: 'hang' })
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    const warm = harness.warmCalls()[0]!

    await harness.disposePlugin()

    expect(warm.options.signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('fences late warm results after unload', async () => {
    await armIdleSession()
    harness.adapter.enqueue({ kind: 'hang' })
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)
    const warm = harness.warmCalls()[0]!

    await harness.disposePlugin()
    warm.release()
    await harness.flush()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 10)

    expect(harness.warmCalls()).toHaveLength(1)
  })
})
