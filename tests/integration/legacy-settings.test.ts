import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SETTINGS_NAMESPACE } from '../../src/shared/settings.ts'
import { IntegrationHarness, SESSION_A } from './harness.ts'

/** The pre-rc.1 user document: one keepalive section plus a section this plugin does not own. */
const LEGACY_DOCUMENT = [
  `${SETTINGS_NAMESPACE}:`,
  '  sessions:',
  `    ${String(SESSION_A)}:`,
  '      intervalMs: 1000',
  '      idleTimeoutMs: 300000',
  'unrelated-plugin:',
  '  keep: true',
  '',
].join('\n')

/**
 * DSH 0.1.7 replaced the abstract settings provider with the profile's own
 * configuration document, so a user's existing `settings.yaml` must arrive in
 * the new document and reach the running plugin without a restart.
 */
describe('legacy settings document migration', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount({ legacySettings: LEGACY_DOCUMENT })
    // The import is asynchronous Host I/O started by the settings service after
    // the Loader settles, so it is awaited by its observable effect: the live
    // plugin config carrying the migrated value. It is awaited on real timers,
    // because a faked clock cannot complete real profile-document I/O.
    await harness.waitFor(
      () => JSON.stringify(harness.storedSection()).includes('idleTimeoutMs'),
      () => JSON.stringify(harness.storedSection()),
    )
    harness.useFakeTimers()
  })

  afterEach(async () => {
    harness.useRealTimers()
    await harness.dispose()
  })

  it('imports the keepalive section into the profile document the plugin reads', () => {
    // The migrated values are in the profile's own patch document, under the id
    // that is also the settings namespace.
    expect(harness.patchDocument()).toContain(SETTINGS_NAMESPACE)
    expect(harness.patchDocument()).toContain(String(SESSION_A))
    expect(harness.patchDocument()).toContain('idleTimeoutMs: 300000')
    // The migrated user layer holds exactly what the old document declared.
    expect(harness.userSection()).toEqual({
      sessions: { [String(SESSION_A)]: { intervalMs: 1_000, idleTimeoutMs: 300_000 } },
    })
    expect(harness.storedSection()).toEqual({
      sessions: {
        [String(SESSION_A)]: { enabled: true, intervalMs: 1_000, idleTimeoutMs: 300_000 },
      },
    })
  })

  it('keeps the old document as a backup instead of discarding the sections it cannot place', () => {
    const imported = readFileSync(join(harness.home, 'settings.yaml.imported'), 'utf8')
    expect(imported).toBe(LEGACY_DOCUMENT)
  })

  it('schedules the migrated interval on the running plugin', async () => {
    await harness.runTurn(SESSION_A)

    harness.adapter.scriptCalls('complete')
    await harness.advance(999)
    expect(harness.warmCalls()).toHaveLength(0)

    await harness.advance(1)
    const warm = harness.warmCalls()
    expect(warm).toHaveLength(1)
    expect(warm[0]?.options.sessionId).toBe(SESSION_A)
  })
})
