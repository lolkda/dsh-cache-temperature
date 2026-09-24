/**
 * Type-level check of the real slot contract this entry registers against.
 *
 * These functions are never executed: they exist so `tsc` proves, at compile
 * time, that the component accepts exactly the composed props the framework
 * passes to a `conversation.input.left` entry and that the slot core's own
 * `register` signature accepts this entry's options and component. Without this
 * file the registration contract would only be checked once the renderer
 * package's `Context.slots` declaration is available.
 */
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import { SlotCore, type ComposedProps } from '@deepseek-ai/dsh-client-ui-slots'

import { KeepaliveControl } from '../../src/client/KeepaliveControl.tsx'
import type { KeepaliveControl as KeepaliveControlModel } from '../../src/client/control-model.ts'
import { KEEPALIVE_LOCALE_NAMESPACE } from '../../src/client/locales.ts'
import { keepaliveEntry, type KeepaliveControlInjected } from '../../src/client/plugin.ts'

/** Props the framework composes for this entry, derived from the real slot declaration. */
export type KeepaliveEntryComposedProps = ComposedProps<
  'conversation.input.left',
  string,
  never,
  undefined,
  KeepaliveControlInjected,
  never,
  typeof KEEPALIVE_LOCALE_NAMESPACE
>

/** The component must accept the composed props share verbatim. */
export function acceptsComposedProps(props: KeepaliveEntryComposedProps): void {
  KeepaliveControl(props)
}

/** The slot core's own register signature must accept this entry's options and component. */
export function registersThroughSlotCore(
  core: SlotCore,
  controlFor: (sessionId: string) => KeepaliveControlModel,
): void {
  core.register(keepaliveEntry(controlFor), KeepaliveControl)
}
