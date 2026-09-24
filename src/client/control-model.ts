import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

import {
  DEFAULT_SESSION_SETTINGS,
  decodeSettingsDocument,
  getSessionSettings,
  minutesToMilliseconds,
  type SessionKeepaliveSettings,
} from '../shared/settings.ts'

/** Honest presentation state of one session's keepalive preference. */
export type KeepaliveControlStatus =
  | 'loading'
  | 'unavailable'
  | 'readonly'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict'

/** One session's keepalive preference as the interface presents it. */
export interface KeepaliveControlView {
  /** Where the preference stands right now; never a success the Host did not confirm. */
  readonly status: KeepaliveControlStatus
  /** Settings in effect for this session; defaults until a stored entry is read. */
  readonly settings: SessionKeepaliveSettings
  /** Host or validation detail for a failed write; null otherwise. */
  readonly detail: string | null
}

/** Read and write one session's keepalive preference through the settings form. */
export interface KeepaliveControl extends ObservableSnapshot<KeepaliveControlView> {
  /** Store the enabled flag for this session. */
  setEnabled(enabled: boolean): Promise<void>
  /** Store the refresh interval, given in user-facing minutes. */
  setIntervalMinutes(minutes: number): Promise<void>
  /** Store the idle window, given in user-facing minutes. */
  setIdleTimeoutMinutes(minutes: number): Promise<void>
}

/** Readable base state derived only from the settings scope snapshot. */
interface BaseState {
  readonly status: 'loading' | 'unavailable' | 'readonly' | 'ready'
  readonly settings: SessionKeepaliveSettings
}

/** Narrow one unknown boundary value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a human-readable detail from an unknown failure at the write boundary. */
function describeFailure(reason: unknown): string {
  if (typeof reason === 'string' && reason !== '') return reason
  if (reason instanceof Error && reason.message !== '') return reason.message
  if (isRecord(reason)) {
    const message = reason['message']
    if (typeof message === 'string' && message !== '') return message
    const code = reason['code']
    if (typeof code === 'string' && code !== '') return code
  }
  return 'The settings write failed'
}

/** Write phase of the current or latest write attempt. */
interface WritePhase {
  readonly phase: 'idle' | 'saving' | 'saved' | 'error' | 'conflict'
  readonly detail: string | null
}

/**
 * Create the per-session control over one bound settings namespace form.
 *
 * Writes carry the namespace revision as their fence, so a concurrent change
 * from another surface is refused instead of overwriting it. The control never
 * reports a stored value the Host did not confirm.
 * @param options - the bound entry form and the session this control addresses.
 * @returns the observable control with its three field writers.
 */
export function createKeepaliveControl(options: {
  readonly form: ConfigForm<unknown>
  readonly sessionId: string
}): KeepaliveControl {
  const { form, sessionId } = options
  const listeners = new Set<() => void>()
  let unsubscribeScope: (() => void) | null = null
  let write: WritePhase = { phase: 'idle', detail: null }
  let chain: Promise<void> | null = null
  let cached: KeepaliveControlView | null = null
  /** Scope snapshot the cached view was derived from; the scope's reference is stable per change. */
  let cachedFor: unknown = null

  /** Resolve the readable state of the addressed session from the scope snapshot. */
  function baseState(): BaseState {
    const snapshot = form.getSnapshot()
    if (snapshot.status === 'loading') {
      return { status: 'loading', settings: DEFAULT_SESSION_SETTINGS }
    }
    if (snapshot.status !== 'ready' || snapshot.value === undefined) {
      return { status: 'unavailable', settings: DEFAULT_SESSION_SETTINGS }
    }
    let settings: SessionKeepaliveSettings
    try {
      settings = getSessionSettings(decodeSettingsDocument(snapshot.value), sessionId)
    } catch {
      return { status: 'unavailable', settings: DEFAULT_SESSION_SETTINGS }
    }
    if (!snapshot.writable || snapshot.mode === 'memory') {
      return { status: 'readonly', settings }
    }
    return { status: 'ready', settings }
  }

  /**
   * Compose the published view from the scope snapshot and the write phase. The
   * scope stays the only authority on the stored value, and a base state that
   * cannot be edited outranks any write outcome: a section that became readonly
   * after a successful save must not keep presenting itself as editable.
   */
  function computeView(): KeepaliveControlView {
    const base = baseState()
    if (base.status !== 'ready') {
      return { status: base.status, settings: base.settings, detail: null }
    }
    const settings = base.settings
    switch (write.phase) {
      case 'saving':
        return { status: 'saving', settings, detail: null }
      case 'saved':
        return { status: 'saved', settings, detail: null }
      case 'error':
        return { status: 'error', settings, detail: write.detail }
      case 'conflict':
        return { status: 'conflict', settings, detail: write.detail }
      default:
        return { status: base.status, settings, detail: null }
    }
  }

  /** Invalidate the cached view and notify every subscriber. */
  function notify(): void {
    cached = null
    for (const listener of [...listeners]) listener()
  }

  /** Observe an external document change. */
  function handleScopeChange(): void {
    notify()
  }

  /** Run one write task after the previously queued one, never rejecting the queue. */
  function enqueue(task: () => Promise<void>): Promise<void> {
    const previous = chain
    const run = previous === null ? task() : previous.then(task, task)
    const settled = run.then(
      () => {
        if (chain === settled) chain = null
      },
      () => {
        if (chain === settled) chain = null
      },
    )
    chain = settled
    return run
  }

  /** Store one field of the addressed session, fenced by the current revision. */
  async function runWrite(
    field: keyof SessionKeepaliveSettings,
    value: number | boolean,
  ): Promise<void> {
    const snapshot = form.getSnapshot()
    const base = baseState()
    if (base.status !== 'ready') return
    const fence = snapshot.revision
    write = { phase: 'saving', detail: null }
    notify()
    const ops: readonly SettingsPathOpView[] = [{ op: 'set', path: ['sessions', sessionId, field], value }]
    try {
      // The form answers whether the Host accepted the write; only a transport
      // failure rejects. A refusal is not a save, so it must be classified here.
      const accepted = await form.mutate(ops, fence)
      if (accepted) {
        write = { phase: 'saved', detail: null }
      } else {
        const settled = form.getSnapshot().revision
        const conflicted = fence !== undefined && settled !== undefined && settled !== fence
        write = { phase: conflicted ? 'conflict' : 'error', detail: null }
      }
    } catch (reason) {
      const settled = form.getSnapshot().revision
      const conflicted = fence !== undefined && settled !== undefined && settled !== fence
      write = { phase: conflicted ? 'conflict' : 'error', detail: describeFailure(reason) }
    }
    notify()
  }

  /** Queue one field write of the addressed session. */
  function performWrite(
    field: keyof SessionKeepaliveSettings,
    value: number | boolean,
  ): Promise<void> {
    return enqueue(() => runWrite(field, value))
  }

  /** Queue a duration write, converting user-facing minutes inside the queue. */
  function performDurationWrite(
    field: 'intervalMs' | 'idleTimeoutMs',
    minutes: number,
  ): Promise<void> {
    return enqueue(async () => {
      let milliseconds: number
      try {
        milliseconds = minutesToMilliseconds(minutes)
      } catch (reason) {
        if (baseState().status === 'ready') {
          write = { phase: 'error', detail: describeFailure(reason) }
          notify()
        }
        return
      }
      await runWrite(field, milliseconds)
    })
  }

  return {
    getSnapshot() {
      const source = form.getSnapshot()
      if (cached === null || cachedFor !== source) {
        cached = computeView()
        cachedFor = source
      }
      return cached
    },
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) unsubscribeScope = form.subscribe(handleScopeChange)
      let active = true
      return () => {
        if (!active) return
        active = false
        listeners.delete(listener)
        if (listeners.size === 0) {
          unsubscribeScope?.()
          unsubscribeScope = null
        }
      }
    },
    setEnabled(enabled) {
      return performWrite('enabled', enabled)
    },
    setIntervalMinutes(minutes) {
      return performDurationWrite('intervalMs', minutes)
    },
    setIdleTimeoutMinutes(minutes) {
      return performDurationWrite('idleTimeoutMs', minutes)
    },
  }
}
