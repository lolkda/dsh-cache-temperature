import { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { describe, expect, it } from 'vitest'
import { apply as applyClient, inject as clientInject } from '../../src/client/index.ts'
import { KEEPALIVE_LOCALE_NAMESPACE, keepaliveDictionaries } from '../../src/client/locales.ts'
import { SlotLedgerService, declareSlot } from './slot-ledger.ts'

/** A settings form that never serves a value; this suite exercises slot registration only. */
function inertForm(): ConfigForm<unknown> {
  return {
    getSnapshot: () => ({
      status: 'loading',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'memory',
    }),
    subscribe: () => () => {},
    mutate: async () => true,
    set: async () => true,
    unset: async () => true,
  }
}

/**
 * Cold start does not guarantee our row activates after the row that declares
 * `conversation.input.left`; the deployment's own conversation row waits with
 * `slots.inject` for exactly this reason. Registration must tolerate the
 * declaration arriving later instead of failing plugin activation.
 */
describe('client control registration over the real slot ledger', () => {
  it('waits for a late slot declaration and registers once it lands', async () => {
    const core = new SlotCore()
    const dictionaries: { ns: string; dicts: unknown }[] = []
    const ctx = new Context()
    ctx.plugin(SlotLedgerService, { core })
    ctx.provide('locale', {
      register: (ns: string, dicts: unknown) => {
        dictionaries.push({ ns, dicts })
        return () => {}
      },
    })
    ctx.provide('configForms', { get: () => inertForm() })

    const fiber = ctx.plugin({ name: 'cache-temperature-client', inject: clientInject, apply: applyClient })
    // Activation must survive a target that is not declared yet.
    await fiber
    expect(core.entries('conversation.input.left')).toHaveLength(0)

    declareSlot(core)

    const entries = core.entries('conversation.input.left')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.id).toBe('cache-keepalive')
    expect(entries[0]?.options.order).toBe(10)
    expect(dictionaries).toEqual([{ ns: KEEPALIVE_LOCALE_NAMESPACE, dicts: keepaliveDictionaries }])

    // Unloading the plugin removes its contribution from the ledger.
    await fiber.dispose()
    expect(core.entries('conversation.input.left')).toHaveLength(0)
  })
})
