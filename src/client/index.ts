import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

import { KEEPALIVE_LOCALE_NAMESPACE } from './locales.ts'
import { installKeepaliveControl, type KeepalivePluginHost } from './plugin.ts'

/** Services this client plugin requires: slot registration, settings forms, and locale. */
export const inject = ['slots', 'configForms', 'locale']

/**
 * The client context capabilities this plugin's adapter reads. Each member is
 * derived from the real `Context`, so the DSH entry point below proves the
 * adapter still matches the deployment's client API.
 */
export interface KeepaliveContextServices {
  /** Register a lifecycle-owned resource. */
  readonly effect: (callback: () => () => void, label: string) => unknown
  /** Dictionary registry the control's copy is registered in. */
  readonly locale: Pick<Context['locale'], 'register'>
  /** Settings entry-form service, addressed by the entry id this plugin owns. */
  readonly configForms: Pick<Context['configForms'], 'get'>
  /** Slot registry: contributions wait for their target slot's declaration. */
  readonly slots: Pick<Context['slots'], 'inject' | 'register'>
}

/**
 * Adapt the DSH client context to the keepalive host seam.
 *
 * The slot entry is contributed through `slots.inject` rather than registered
 * directly: `slots.register` throws while its target slot is undeclared, and
 * `conversation.input.left` is itself declared late — the conversation plugin
 * declares it while waiting for the `main` slot. A direct registration would
 * therefore fail on a cold boot and silently drop this control; `inject` runs
 * the registration synchronously when the declaration already exists, and
 * inside the declaring call otherwise.
 *
 * The settings form is resolved by entry id through `configForms.get`, which
 * owns one shared form per Host entry and accepts no decoder: the section
 * reaches the control raw — its `sessions` dictionary is not narrowed here —
 * and the control validates that snapshot at its own boundary.
 * @param ctx - the client context capabilities this plugin consumes.
 * @returns the host seam `installKeepaliveControl` installs against.
 */
export function adaptContext(ctx: KeepaliveContextServices): KeepalivePluginHost {
  return {
    effect: (callback, label) => {
      ctx.effect(callback, label)
    },
    registerDictionaries: dictionaries => ctx.locale.register(KEEPALIVE_LOCALE_NAMESPACE, dictionaries),
    formFor: entryId => ctx.configForms.get(entryId),
    registerControl: (options, component) =>
      ctx.slots.inject(options.name, () => ctx.slots.register(options, component)),
  }
}

/**
 * Client plugin body: install the compact per-session keepalive control.
 * @param ctx - client cordis context.
 */
export function apply(ctx: Context): void {
  installKeepaliveControl(adaptContext(ctx))
}
