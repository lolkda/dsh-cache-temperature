import { Context, Service } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { KeepaliveComponent, KeepaliveEntryOptions } from '../../src/client/plugin.ts'

/**
 * The Slots service face the keepalive client consumes, over the deployment's
 * real `SlotCore`. It keeps the two mechanisms that make the boundary real: the
 * core's own `register` (which throws for an undeclared slot) and the
 * documented `inject` contract — run now when the declaration exists, otherwise
 * from the declaring `register()` after the declaration commits, re-run after a
 * collapse plus later declaration, and owned by the CALLER's fiber so an unload
 * removes the contribution. Ownership uses `this.ctx.effect`, which the Cordis
 * service proxy binds to the calling plugin's context.
 */
export class SlotLedgerService extends Service {
  readonly core: SlotCore

  constructor(ctx: Context, config: { core: SlotCore }) {
    super(ctx, 'slots')
    this.core = config.core
  }

  /** Register one entry and tie its disposal to the caller's fiber. */
  register(options: KeepaliveEntryOptions, component: KeepaliveComponent): () => void {
    const dispose = this.core.register(options, component)
    const remove = this.ctx.effect(() => dispose)
    return () => {
      void remove()
    }
  }

  /** Install an effect for each declaration lifetime of one slot. */
  inject(key: string, callback: () => () => void): () => void {
    return this.ctx.effect(() => {
      let dispose: (() => void) | undefined
      const unsubscribe = this.core.subscribeDeclaration(key, () => {
        if (this.core.declarationEpoch(key) === 0) {
          dispose?.()
          dispose = undefined
          return
        }
        dispose ??= callback()
      })
      if (this.core.declarationEpoch(key) > 0) dispose = callback()
      return () => {
        unsubscribe()
        dispose?.()
        dispose = undefined
      }
    })
  }
}

/**
 * A declaring entry must render the children it declares — the typed registry
 * enforces that at compile time — so this fixture consumes the child through
 * the `renderSlot` seat it is handed.
 */
function DeclaringEntry(props: {
  readonly renderSlot: (key: 'conversation.input.left', owner: object) => unknown
}): null {
  props.renderSlot('conversation.input.left', {})
  return null
}

/** Declare one slot the way a parent entry's children table does. */
export function declareSlot(core: SlotCore): void {
  core.register(
    { name: 'root', children: { 'conversation.input.left': { kind: 'list', scope: 'session' } } },
    DeclaringEntry,
  )
}
