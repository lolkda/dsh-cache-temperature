import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostHarness, SESSION_ID } from './harness.ts'

const INTERVAL_MS = 60_000

describe('host keepalive diagnostics and live-session state', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
    await harness.setSettings(SESSION_ID, { intervalMs: INTERVAL_MS, idleTimeoutMs: 900_000 })
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    harness.clearLogs()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('reports a normally finished warm request as ok with route and usage only', async () => {
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const logs = harness.warmLogs()
    expect(logs.some(entry => entry.type === 'info' && entry.text.includes('status=ok'))).toBe(true)
    expect(logs.some(entry => entry.text.includes('route=stub/stub-model'))).toBe(true)
    expect(logs.some(entry => entry.text.includes('warm start'))).toBe(true)
    expect(logs.every(entry => !entry.text.includes('hello'))).toBe(true)
    expect(logs.every(entry => !entry.text.includes('system prompt'))).toBe(true)
  })

  it('does not report a warm request without a terminal finish as ok', async () => {
    harness.adapter.enqueue({ kind: 'empty' })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const logs = harness.warmLogs()
    expect(logs.some(entry => entry.text.includes('status=ok'))).toBe(false)
    expect(logs.some(entry => entry.type === 'warn')).toBe(true)
  })

  it('reports a rejected warm request as an error', async () => {
    harness.adapter.enqueue({
      kind: 'fail',
      failure: { message: 'rejected', code: 'invalid_max_tokens', status: 400 },
    })

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const logs = harness.warmLogs()
    expect(logs.some(entry => entry.type === 'warn' && entry.text.includes('invalid_max_tokens'))).toBe(true)
  })

  it('drops the session state when its agent is disposed', async () => {
    harness.emitAgentDisposed()
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(harness.warmCalls()).toHaveLength(0)
  })

  it('drops the session state when its session is disposed', async () => {
    harness.emitSessionDisposed()
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(harness.warmCalls()).toHaveLength(0)
  })
})

describe('host keepalive mounting mid-session', () => {
  it('seeds the running state of agents that were live before mount', async () => {
    const seeded = await HostHarness.mount({ liveAgents: [{ id: SESSION_ID, status: 'running' }] })
    try {
      seeded.useFakeTimers()
      await seeded.setSettings(SESSION_ID, { intervalMs: INTERVAL_MS, idleTimeoutMs: 900_000 })
      await seeded.request()
      seeded.emitTurnEnd({ kind: 'completed' })
      await seeded.flush()

      await vi.advanceTimersByTimeAsync(INTERVAL_MS)
      expect(seeded.warmCalls()).toHaveLength(0)

      seeded.emitStatus('idle')
      await vi.advanceTimersByTimeAsync(1)
      expect(seeded.warmCalls()).toHaveLength(1)
    } finally {
      seeded.useRealTimers()
      await seeded.dispose()
    }
  })
})
