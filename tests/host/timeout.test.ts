import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEPALIVE_REQUEST_TIMEOUT_MS } from '../../src/shared/settings.ts'
import { HostHarness, SESSION_ID } from './harness.ts'

/** The user-approved single warm-request timeout. */
const APPROVED_TIMEOUT_MS = 90_000

describe('keepalive request timeout contract', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('is the user-approved 90 seconds', () => {
    expect(KEEPALIVE_REQUEST_TIMEOUT_MS).toBe(APPROVED_TIMEOUT_MS)
  })

  it('lets a hanging warm request run until 90 seconds and then aborts it', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(60_000)
    const warm = harness.warmCalls()[0]!

    await vi.advanceTimersByTimeAsync(APPROVED_TIMEOUT_MS - 1)
    expect(warm.options.signal?.aborted).toBe(false)
    expect(warm.finished).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(warm.options.signal?.aborted).toBe(true)
    await harness.flush()
    expect(warm.aborted).toBe(true)
  })

  it('still lets the idle deadline preempt a warm request before 90 seconds', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 10_000, idleTimeoutMs: 15_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(10_000)
    const warm = harness.warmCalls()[0]!
    expect(warm.options.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(warm.options.signal?.aborted).toBe(true)
    expect(APPROVED_TIMEOUT_MS).toBeGreaterThan(15_000)
  })

  it('still lets a foreground request preempt a warm request before 90 seconds', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(60_000)
    const warm = harness.warmCalls()[0]!
    expect(warm.finished).toBe(false)

    const foreground = harness.startRequest()
    await harness.flush()

    expect(warm.options.signal?.aborted).toBe(true)
    await foreground.settled
  })

  it('still lets an explicit cancellation preempt a warm request before 90 seconds', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitStatus('running')
    const tool = harness.startTool()
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(60_000)
    const warm = harness.warmCalls()[0]!
    expect(warm.finished).toBe(false)

    // The user stops the long tool the keepalive is riding on.
    tool.controller.abort()
    await harness.flush()

    expect(warm.options.signal?.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(APPROVED_TIMEOUT_MS)
    expect(harness.warmCalls()).toHaveLength(1)
    tool.release()
  })
})
