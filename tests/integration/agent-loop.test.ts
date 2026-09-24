import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IntegrationHarness, SESSION_A, type RecordedCall } from './harness.ts'

/**
 * The strongest version of the capture contract: the request the plugin
 * snapshots is the one the deployment's own agent loop issued, not a hand-built
 * object carrying the loop's marker.
 */
describe('real agent loop request capture and warm replay', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('captures the loop-issued request and replays it warm after the turn ends', async () => {
    await harness.runTurn(SESSION_A)

    const real = harness.realCalls()
    expect(real).toHaveLength(1)
    expect(real[0]?.marked).toBe(true)
    // Positive control for the foreground window: the loop's own request is
    // consumed while the plugin sees the session as busy.
    expect(real[0]?.duringForegroundConsumption).toBe(true)
    expect(harness.warmCalls()).toHaveLength(0)

    harness.adapter.scriptCalls('complete')
    await harness.advance(240_000)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(1)
    const replay = warm[0] as RecordedCall | undefined
    const origin = real[0] as RecordedCall | undefined
    if (replay === undefined || origin === undefined) return
    // A warm replay is unmarked, so the loop never sees it as its own request.
    expect(replay.marked).toBe(false)
    expect(replay.options.maxTokens).toBe(1)
    expect(replay.options.sessionId).toBe(SESSION_A)
    expect(replay.options.provider).toBe(origin.options.provider)
    expect(replay.options.model).toBe(origin.options.model)
    expect(replay.options.messages).toBe(origin.options.messages)
    expect(replay.options.signal).not.toBe(origin.options.signal)
    expect(replay.finished).toBe(true)
    expect(replay.aborted).toBe(false)
  })

  it('keeps the warm replay out of the agent loop entirely', async () => {
    await harness.runTurn(SESSION_A)
    const before = { ...harness.counters }

    harness.adapter.scriptCalls('complete')
    await harness.advance(240_000)

    expect(harness.warmCalls()).toHaveLength(1)
    expect(harness.realCalls()).toHaveLength(1)
    expect(harness.counters).toEqual(before)
    expect(harness.counters.toolDispatches).toBe(0)
    expect(harness.counters.toolResults).toBe(0)
  })
})
