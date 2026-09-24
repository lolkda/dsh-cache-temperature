import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { HostHarness, SESSION_ID } from './harness.ts'

const INTERVAL_MS = 240_000

describe('host keepalive lifecycle', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('uses the configured refresh interval instead of the default', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(59_999)
    expect(harness.warmCalls()).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('keeps refreshing while the idle window stays open', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 600_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(180_000)

    expect(harness.warmCalls()).toHaveLength(3)
  })

  it('never lets a warm success extend the idle deadline', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 120_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.warmCalls()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('keeps a long tool wait warm with no idle cap', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000, idleTimeoutMs: 60_000 })
    await harness.request()
    harness.emitStatus('running')
    const tool = harness.startTool()
    await harness.flush()

    await vi.advanceTimersByTimeAsync(300_000)

    expect(harness.warmCalls().length).toBeGreaterThanOrEqual(5)
    tool.release()
    await tool.settled
  })

  it('keeps the idle window open whether status turns idle before or after the turn ends', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await harness.request()
    harness.emitStatus('idle')
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('keeps the idle window when the finished request signal aborts later', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    const started = harness.startRequest()
    await started.settled
    harness.emitStatus('idle')
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    started.controller.abort()
    await harness.flush()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('honours per-session settings independently', async () => {
    const other = 'session-2' as SessionId
    await harness.setSettings(SESSION_ID, { enabled: false })
    await harness.request({}, other)
    harness.emitTurnEnd({ kind: 'completed' }, other)
    await harness.request({}, SESSION_ID)
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(1)
    expect(warm[0]!.options.sessionId).toBe(other)
  })

  it('stops warming a session as soon as it is disabled', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await harness.setSettings(SESSION_ID, { enabled: false })
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)

    expect(harness.warmCalls()).toHaveLength(0)
  })

  it('aborts an in-flight warm request the moment a real request starts', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
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
    expect(warm.aborted).toBe(true)
    await foreground.settled
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('cancels an in-flight warm the moment the tool it waits on is cancelled', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await harness.request()
    harness.emitStatus('running')
    const tool = harness.startTool()
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })

    await vi.advanceTimersByTimeAsync(60_000)
    const warm = harness.warmCalls()[0]!
    expect(warm.finished).toBe(false)

    tool.controller.abort()
    await harness.flush()

    expect(warm.options.signal?.aborted).toBe(true)
    expect(warm.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)
    expect(harness.warmCalls()).toHaveLength(1)
    tool.release()
  })

  it('stops warming the round immediately when the running request is cancelled', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.adapter.enqueue({ kind: 'hang' })
    const stopped = harness.startRequest()
    harness.emitStatus('running')
    await harness.flush()

    stopped.controller.abort()
    await harness.flush()
    const tool = harness.startTool()
    await harness.flush()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2)

    expect(harness.warmCalls()).toHaveLength(0)
    tool.release()
  })

  it('ignores a late abort from a previous round', async () => {
    await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
    const first = harness.startRequest()
    await first.settled
    harness.emitTurnEnd({ kind: 'aborted', reason: { kind: 'user' } })

    const second = harness.startRequest()
    await second.settled
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    first.controller.abort()
    await harness.flush()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.warmCalls()).toHaveLength(1)
  })
})
