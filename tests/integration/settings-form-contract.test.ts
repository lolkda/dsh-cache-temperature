import Schema from '@deepseek-ai/schemastery'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeSettingsDocument } from '../../src/shared/settings.ts'
import { IntegrationHarness, SESSION_A } from './harness.ts'

/**
 * The browser's settings form is usable only once its namespace decodes.
 *
 * The deployed client (`ConfigFormController.decode` in
 * `@deepseek-ai/dsh-client-ui-settings`) rehydrates the Host-projected schema
 * envelope with `new Schema(view.schema)` and validates the projected section
 * against it. While that validation fails, the form stays at `loading` and the
 * composer control can neither show nor write a preference — the state a user
 * sees as "正在读取保温设置…" with a dead switch.
 *
 * The projection under test is the deployment's own: `SettingsForms.describe`
 * runs the real `volatileForm`/`plainSchema`/`projectForm` over the plugin's
 * `Config`. Only the client's decode step is restated here, because the client
 * bundle exports no testable surface for it.
 *
 * @param envelope - the schema envelope the Host serves for this namespace.
 * @param value - the projected section the Host serves alongside it.
 * @returns the decode failure the client would report, or undefined when the form reaches ready.
 */
function clientFormDecodeFailure(envelope: unknown, value: unknown): string | undefined {
  const rehydrated = new Schema(envelope as Partial<Schema>) as (draft: unknown) => unknown
  try {
    rehydrated(value)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/** The section the browser form and the keepalive control both read. */
describe('the settings section the browser form receives', () => {
  let harness: IntegrationHarness

  beforeEach(async () => {
    harness = await IntegrationHarness.mount()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('decodes into a ready form instead of leaving the control at loading', () => {
    expect(clientFormDecodeFailure(harness.namespaceSchema(), harness.storedSection())).toBeUndefined()
  })

  it('still decodes after a session preference is written', async () => {
    await harness.writeSessionField(String(SESSION_A), 'intervalMs', 300_000)

    expect(clientFormDecodeFailure(harness.namespaceSchema(), harness.storedSection())).toBeUndefined()
    expect(decodeSettingsDocument(harness.storedSection())).toEqual({
      sessions: {
        [String(SESSION_A)]: { enabled: true, intervalMs: 300_000, idleTimeoutMs: 1_800_000 },
      },
    })
  })
})
