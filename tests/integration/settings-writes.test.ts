import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_NAMESPACE, decodeSettingsDocument } from '../../src/shared/settings.ts'
import { IntegrationHarness, SESSION_A } from './harness.ts'

/**
 * The rc.1 Loader owns the plugin's configuration: a form write validates and
 * commits through the profile document, and a volatile-only change reaches the
 * running fiber without a remount. Both facts are what keep a session's captured
 * request alive while a user edits the preference.
 */
describe('native settings writes against the running plugin', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('keeps the captured request across a preference write instead of remounting the plugin', async () => {
    await harness.runTurn(SESSION_A)
    expect(harness.realCalls()).toHaveLength(1)

    // A volatile-only write must commit into the running fiber: were the plugin
    // remounted here, the captured request and its idle window would be gone.
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000)
    harness.adapter.scriptCalls('complete')
    await harness.advance(1_000)

    expect(harness.warmCalls()).toHaveLength(1)
    expect(harness.realCalls()).toHaveLength(1)
    expect(harness.warmCalls()[0]?.options.sessionId).toBe(SESSION_A)
  })

  it('publishes no auto-generated settings page for the raw session dictionary', () => {
    // The preference is presented by the composer control, which owns its own
    // copy and per-session shape. An auto-generated page would instead expose
    // the raw session dictionary — every session id and its stored durations —
    // as a second, unowned surface.
    expect(harness.namespaceAutoGenerate()).toBe(false)
  })

  it('refuses an unknown session field without committing it to the profile document', async () => {
    await expect(harness.ctx.settings.mutate(SETTINGS_NAMESPACE, [
      { op: 'set', path: ['sessions', String(SESSION_A), 'bogus'], value: 1 },
    ])).rejects.toThrow()
    await harness.settle()

    // Nothing was persisted, so the stored document still decodes.
    expect(harness.userSection()).toEqual({})
    expect(decodeSettingsDocument(harness.storedSection())).toEqual({ sessions: {} })
  })

  it('refuses a duration the leaf schema rejects and keeps the previous value', async () => {
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 5_000)
    await expect(harness.ctx.settings.mutate(SETTINGS_NAMESPACE, [
      { op: 'set', path: ['sessions', String(SESSION_A), 'intervalMs'], value: 0 },
    ])).rejects.toThrow()
    await harness.settle()

    expect(harness.userSection()).toEqual({
      sessions: { [String(SESSION_A)]: { intervalMs: 5_000 } },
    })
    expect(harness.storedSection()).toEqual({
      sessions: { [String(SESSION_A)]: { enabled: true, intervalMs: 5_000, idleTimeoutMs: 1_800_000 } },
    })
  })
})
