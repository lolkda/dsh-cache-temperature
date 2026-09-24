import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HostHarness, SESSION_ID } from './harness.ts'

const INTERVAL_MS = 240_000

describe('host keepalive scheduler', () => {
  let harness: HostHarness

  beforeEach(async () => {
    harness = await HostHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('replays the last successful real agent request with one output token', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const real = harness.realCalls()
    const warm = harness.warmCalls()
    expect(real).toHaveLength(1)
    expect(warm).toHaveLength(1)
    const captured = real[0]!.options
    const replay = warm[0]!.options
    expect(replay.maxTokens).toBe(1)
    expect(replay.signal).toBeDefined()
    expect(replay.signal).not.toBe(captured.signal)
    expect(replay.signal?.aborted).toBe(false)
    expect({ ...replay, maxTokens: captured.maxTokens, signal: captured.signal }).toEqual(captured)
  })

  it('replays the exact captured prompt, tool schemas and sampling values', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const captured = harness.realCalls()[0]!.options
    const replay = harness.warmCalls()[0]!.options
    expect(replay.messages).toBe(captured.messages)
    expect(replay.tools).toBe(captured.tools)
    expect(replay.system).toBe(captured.system)
    expect(replay.temperature).toBe(captured.temperature)
    expect(replay.stop).toBe(captured.stop)
    expect(replay.provider).toBe(captured.provider)
    expect(replay.model).toBe(captured.model)
    expect(replay.sessionId).toBe(captured.sessionId)
    expect(replay).not.toBe(captured)
  })

  it('waits one refresh interval before the first warm request', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1)

    expect(harness.warmCalls()).toHaveLength(0)
  })

  it('does not treat its own replay as a real agent request', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(harness.warmCalls()).toHaveLength(1)
    expect(harness.warmCalls()[0]!.marked).toBe(false)
    expect(harness.realCalls()).toHaveLength(1)
  })

  it('never dispatches tools or writes settings while warming', async () => {
    const execute = vi.spyOn(harness.ctx.tools, 'execute')
    const settingsBefore = JSON.stringify(harness.settingsDocument())

    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()
    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(harness.warmCalls()).toHaveLength(1)
    expect(execute).not.toHaveBeenCalled()
    expect(JSON.stringify(harness.settingsDocument())).toBe(settingsBefore)
  })

  it('keeps warming sessions isolated from each other', async () => {
    await harness.request()
    harness.emitTurnEnd({ kind: 'completed' })
    await harness.flush()

    await vi.advanceTimersByTimeAsync(INTERVAL_MS)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(1)
    expect(warm[0]!.options.sessionId).toBe(SESSION_ID)
  })
})
