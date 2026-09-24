import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IntegrationHarness, SESSION_A, SESSION_B } from './harness.ts'

/**
 * A provider backoff is a cross-module promise: the provider said "not before
 * t+5s", so no later scheduling decision — an unrelated settings write, a tool
 * transition, a status change — may bring the next warm attempt forward. The
 * session's own refresh interval is a floor, never a ceiling, on that wait.
 */
describe('provider Retry-After survives unrelated re-planning', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
    harness.useFakeTimers()
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000)
    await harness.runTurn(SESSION_A)
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('does not retry before the provider backoff after another session is saved', async () => {
    harness.adapter.scriptCalls({
      kind: 'fail',
      failure: { message: 'rate limited', code: 'rate-limited', providerRetryAfterMs: 5_000 },
    })
    await harness.advance(1_000)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(1)

    // An unrelated session's settings write re-plans every session.
    await harness.advance(1_000)
    await harness.writeSessionField(String(SESSION_B), 'intervalMs', 2_000)
    await harness.advance(3_999)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(1)

    await harness.advance(1)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(2)
  })

  it('does not retry before the provider backoff after an agent status change', async () => {
    harness.adapter.scriptCalls({
      kind: 'fail',
      failure: { message: 'rate limited', code: 'rate-limited', providerRetryAfterMs: 5_000 },
    })
    await harness.advance(1_000)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(1)

    await harness.advance(1_000)
    harness.emitStatus(SESSION_A, 'running')
    harness.emitStatus(SESSION_A, 'idle')
    await harness.advance(3_999)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(1)

    await harness.advance(1)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(2)
  })

  it('returns to the session cadence once a retry succeeds', async () => {
    harness.adapter.scriptCalls({
      kind: 'fail',
      failure: { message: 'rate limited', code: 'rate-limited', providerRetryAfterMs: 5_000 },
    })
    await harness.advance(1_000)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(1)

    // The retry at the end of the backoff succeeds, so the backoff must not
    // keep acting as the cadence for the attempts that follow it.
    await harness.advance(5_000)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(2)

    await harness.advance(999)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(2)
    await harness.advance(1)
    expect(harness.warmCallsFor(SESSION_A)).toHaveLength(3)
  })
})
