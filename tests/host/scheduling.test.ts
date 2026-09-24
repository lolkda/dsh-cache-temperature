import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostHarness, SESSION_ID } from './harness.ts'

describe('host keepalive scheduling anchors', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('anchors the refresh cadence on the real request, not on the turn end', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 240_000 })
    await harness.request()
    await vi.advanceTimersByTimeAsync(30_000)
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(240_000 - 30_000 - 1)
    expect(harness.warmCalls()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('reschedules immediately when the refresh interval changes', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 240_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.warmCalls()).toHaveLength(0)

    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await vi.advanceTimersByTimeAsync(1)

    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('recomputes the idle deadline from the window start when the timeout changes', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 30_000, idleTimeoutMs: 240_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await harness.setSettings(SESSION_ID, { idleTimeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(90_000)

    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('cancels an in-flight warm when the idle window closes', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 10_000, idleTimeoutMs: 15_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(10_000)
    const warm = harness.warmCalls()[0]!
    expect(warm.finished).toBe(false)

    await vi.advanceTimersByTimeAsync(4_000)
    expect(warm.options.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(warm.options.signal?.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(600_000)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('stops scheduling once the idle window has expired', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 120_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(1_200_000)

    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('keeps at most one warm request in flight even when the provider ignores aborts', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'stubborn' })

    await vi.advanceTimersByTimeAsync(60_000)
    const first = harness.warmCalls()[0]!

    const next = harness.startRequest()
    await next.settled
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(harness.warmCalls()).toHaveLength(1)

    first.release()
    await harness.flush()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.warmCalls()).toHaveLength(2)
  })

  it('does not warm an idle window while the agent is running without a tool', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    harness.emitStatus('running')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.warmCalls()).toHaveLength(0)

    harness.emitStatus('idle')
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(1)
  })
})
