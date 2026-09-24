import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IntegrationHarness, SESSION_A } from './harness.ts'

/** Every test here mounts the real Host plugin over the real DSH runtimes. */
describe('host keepalive over the real Cordis runtime', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('replays the last successful real request with only the budget and signal replaced', async () => {
    await harness.runTurn(SESSION_A)
    const real = harness.realCalls()[0]
    expect(real).toBeDefined()

    harness.adapter.scriptCalls('complete')
    await harness.advance(240_000)

    const warm = harness.warmCalls()[0]
    expect(warm).toBeDefined()
    if (warm === undefined || real === undefined) return
    expect(warm.marked).toBe(false)
    expect(warm.options.maxTokens).toBe(1)
    expect(warm.options.provider).toBe(real.options.provider)
    expect(warm.options.model).toBe(real.options.model)
    expect(warm.options.sessionId).toBe(SESSION_A)
    // The replay carries the very same frozen history, and its own signal.
    expect(warm.options.messages).toBe(real.options.messages)
    expect(warm.options.signal).not.toBe(real.options.signal)
    expect(warm.options.signal).toBeInstanceOf(AbortSignal)
    expect(warm.finished).toBe(true)
    expect(warm.aborted).toBe(false)
  })

  it('produces no session, agent, or tool side effect while warming', async () => {
    await harness.runTurn(SESSION_A)
    const before = { ...harness.counters }

    harness.adapter.scriptCalls('complete')
    await harness.advance(240_000)

    expect(harness.warmCalls()).toHaveLength(1)
    expect(harness.counters).toEqual(before)
    expect(harness.counters.toolDispatches).toBe(0)
    expect(harness.counters.toolResults).toBe(0)
    // The warm replay never entered the agent loop: no real call was added.
    expect(harness.realCalls()).toHaveLength(1)
  })

  it('does not extend the idle window when a warm attempt succeeds', async () => {
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000_000)
    await harness.writeSessionField(String(SESSION_A), 'idleTimeoutMs', 1_800_000)
    await harness.runTurn(SESSION_A)

    harness.adapter.scriptCalls('complete')
    await harness.advance(1_000_000)
    expect(harness.warmCalls()).toHaveLength(1)

    // The refresh cadence alone would wake again at +2,000,000 ms; the idle
    // window closes at +1,800,000 ms and a warm success must not push it out.
    await harness.advance(3_000_000)
    expect(harness.warmCalls()).toHaveLength(1)
  })

  it('cancels an in-flight warm request when a real foreground request starts', async () => {
    await harness.runTurn(SESSION_A)

    harness.adapter.scriptCalls('hang')
    await harness.advance(240_000)
    const warm = harness.warmCalls()[0]
    expect(warm?.finished).toBe(false)

    // The next real turn's own request arrives while the warm request hangs.
    harness.adapter.scriptCalls('hang')
    const turn = await harness.startTurn(SESSION_A)
    await harness.waitForCalls(3)

    expect(warm?.aborted).toBe(true)
    expect(harness.warmCalls()).toHaveLength(1)
    expect(harness.realCalls()).toHaveLength(2)

    // A foreground request in flight preempts new warm work entirely.
    await harness.advance(240_000)
    expect(harness.warmCalls()).toHaveLength(1)

    harness.adapter.calls[2]?.release()
    await turn.idle
    await harness.settle()
  })

  it('cancels timers and the in-flight warm request on plugin unload, fencing late results', async () => {
    await harness.runTurn(SESSION_A)

    harness.adapter.scriptCalls('hang')
    await harness.advance(240_000)
    const warm = harness.warmCalls()[0]
    expect(warm?.finished).toBe(false)

    await harness.unloadPlugin()
    expect(warm?.aborted).toBe(true)

    warm?.release()
    await harness.advance(10_000_000)
    expect(harness.adapter.calls).toHaveLength(2)
    expect(harness.namespaceRegistered()).toBe(false)
  })

  it('serves its settings namespace, releases it on unload, and re-registers on remount', async () => {
    expect(harness.namespaceRegistered()).toBe(true)
    // The resolved value is the schema defaults materialized over the user layer.
    expect(harness.storedSection()).toEqual({ sessions: {} })
    await harness.writeSessionField(String(SESSION_A), 'enabled', false)
    const stored = harness.storedSection()
    expect(stored).toEqual({
      sessions: {
        [String(SESSION_A)]: { enabled: false, intervalMs: 240_000, idleTimeoutMs: 1_800_000 },
      },
    })
    // Only the addressed field reached the persisted user layer.
    expect(harness.userSection()).toEqual({ sessions: { [String(SESSION_A)]: { enabled: false } } })

    await harness.unloadPlugin()
    expect(harness.namespaceRegistered()).toBe(false)

    await harness.mountPlugin()
    expect(harness.namespaceRegistered()).toBe(true)
    // The document is the profile's, not the plugin's: a remount reads it back.
    expect(harness.storedSection()).toEqual(stored)
  })
})
