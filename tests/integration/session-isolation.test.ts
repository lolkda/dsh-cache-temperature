import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_NAMESPACE } from '../../src/shared/settings.ts'
import { IntegrationHarness, SESSION_A, SESSION_B, type RecordedCall } from './harness.ts'

/** Which real request a warm replay was built from, by its message reference. */
function originSession(harness: IntegrationHarness, warm: RecordedCall): string | undefined {
  const real = harness.realCalls().find(call => call.options.messages === warm.options.messages)
  return real === undefined ? undefined : String(real.options.sessionId)
}

/**
 * The client's control writes one field at `sessions/<id>/<field>` with the
 * namespace revision as its fence; these tests drive that exact settings path
 * through the real Loader, configuration editor, and settings forms, and check
 * the Host reacts per session.
 */
describe('per-session settings drive the real host scheduler', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
    harness.useFakeTimers()
    await harness.runTurn(SESSION_A)
    await harness.runTurn(SESSION_B)
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('applies a saved interval to the addressed session only', async () => {
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000)

    // Only the addressed session reached the persisted user layer.
    expect(harness.userSection()).toEqual({
      sessions: { [String(SESSION_A)]: { intervalMs: 1_000 } },
    })

    harness.adapter.scriptCalls('complete')
    await harness.advance(1_000)

    const warm = harness.warmCalls()
    expect(warm).toHaveLength(1)
    expect(warm[0]?.options.sessionId).toBe(SESSION_A)
    expect(originSession(harness, warm[0] as RecordedCall)).toBe(String(SESSION_A))

    // The other session keeps the default cadence and its own history.
    await harness.advance(239_000)
    const warmForB = harness.warmCalls().filter(call => call.options.sessionId === SESSION_B)
    expect(warmForB).toHaveLength(1)
    expect(originSession(harness, warmForB[0] as RecordedCall)).toBe(String(SESSION_B))
    for (const call of harness.warmCalls()) {
      expect(originSession(harness, call)).toBe(String(call.options.sessionId))
    }
  })

  it('stops the addressed session without touching the other one', async () => {
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000)
    harness.adapter.scriptCalls('complete')
    await harness.advance(1_000)
    const warmForABefore = harness.warmCalls().filter(call => call.options.sessionId === SESSION_A)
    expect(warmForABefore).toHaveLength(1)

    await harness.writeSessionField(String(SESSION_A), 'enabled', false)
    await harness.advance(10_000)
    expect(harness.warmCalls().filter(call => call.options.sessionId === SESSION_A))
      .toHaveLength(warmForABefore.length)

    // Session B still warms on its own cadence after A was switched off.
    harness.adapter.scriptCalls('complete')
    await harness.advance(229_000)
    expect(harness.warmCalls().filter(call => call.options.sessionId === SESSION_B)).toHaveLength(1)
  })

  it('refuses a write carrying a stale namespace revision', async () => {
    const revision = harness.namespaceRevision()
    expect(revision).toBeDefined()
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 2_000)

    const stale = harness.ctx.settings.mutate(
      SETTINGS_NAMESPACE,
      [{ op: 'set', path: ['sessions', String(SESSION_A), 'intervalMs'], value: 3_000 }],
      revision,
    )
    await expect(stale).rejects.toMatchObject({ code: 'SETTINGS_CONFLICT' })
    // The refused write stored nothing.
    expect(harness.userSection()).toEqual({
      sessions: { [String(SESSION_A)]: { intervalMs: 2_000 } },
    })
  })
})
