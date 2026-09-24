import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

/**
 * Test double for one entry's settings form, holding the real contract's
 * observable behavior: it applies ordered path operations to a real document,
 * fences every write on the entry revision, folds committed writes into its
 * snapshot, and answers a write the Host refuses with `false` — a transport
 * failure is the only outcome that rejects.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read one session entry straight from a fake form's held document. */
export function storedSessionEntry(form: FakeForm, sessionId: string): unknown {
  const document = form.getSnapshot().value
  if (!isRecord(document) || !isRecord(document['sessions'])) return undefined
  return document['sessions'][sessionId]
}

/** Immutably apply one `set` operation path. */
function setPath(
  root: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) return root
  const next = { ...root }
  if (rest.length === 0) {
    next[head] = value
    return next
  }
  next[head] = setPath(isRecord(next[head]) ? next[head] : {}, rest, value)
  return next
}

/** Immutably apply one `unset` operation path. */
function unsetPath(root: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  const [head, ...rest] = path
  if (head === undefined) return root
  if (rest.length === 0) {
    const next = { ...root }
    delete next[head]
    return next
  }
  if (!isRecord(root[head])) return root
  const next = { ...root }
  next[head] = unsetPath(root[head], rest)
  return next
}

/** Apply one ordered path operation to a document. */
function applyOp(document: unknown, op: SettingsPathOpView): unknown {
  const root = isRecord(document) ? document : {}
  return op.op === 'set' ? setPath(root, op.path, op.value) : unsetPath(root, op.path)
}

/** One recorded write attempt. */
export interface RecordedMutation {
  readonly ops: readonly SettingsPathOpView[]
  readonly expectedRevision: number | undefined
}

/** Observable settings form used by the Client tests. */
export interface FakeForm extends ConfigForm<unknown> {
  /** Every mutation attempt in call order. */
  readonly mutations: readonly RecordedMutation[]
  /** Current snapshot subscriber count. */
  readonly listenerCount: number
  /** Commit a change made by another surface: fold a document and advance the revision. */
  commitExternally(document: unknown): void
  /** Replace the held document without advancing the revision. */
  replaceDocument(document: unknown): void
  /** Make the next write fail on the wire instead of reaching the Host. */
  failNextWrite(reason: unknown): void
  /** Make the next write come back refused, with the held revision unchanged. */
  refuseNextWrite(): void
  /** Hold writes in flight until the returned release function runs. */
  holdWrites(): () => void
  /** Set the published entry status. */
  setStatus(status: ConfigFormSnapshot<unknown>['status']): void
  /** Flip whether the host document accepts writes. */
  setWritable(writable: boolean): void
}

/** Create an observable fake form over a real settings document. */
export function createFakeForm(options: {
  document?: unknown
  status?: ConfigFormSnapshot<unknown>['status']
  writable?: boolean
  mode?: 'host' | 'memory'
  revision?: number
} = {}): FakeForm {
  let document: unknown = options.document ?? {}
  let status = options.status ?? 'ready'
  let writable = options.writable ?? true
  const mode = options.mode ?? 'host'
  let revision = options.revision ?? 1
  const failures: unknown[] = []
  let refusals = 0
  let gate: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const mutations: RecordedMutation[] = []

  let snapshot = build()

  function build(): ConfigFormSnapshot<unknown> {
    return {
      status,
      value: status === 'ready' ? document : undefined,
      base: {},
      user: {},
      revision: status === 'ready' ? revision : undefined,
      writable,
      mode,
    }
  }

  /** Rebuild the cached snapshot and notify subscribers. */
  function publish(): ConfigFormSnapshot<unknown> {
    snapshot = build()
    for (const listener of [...listeners]) listener()
    return snapshot
  }

  /**
   * Run one write through the shared gating, failure, refusal, and fence path.
   * @returns whether the Host accepted the write.
   */
  async function write(
    expectedRevision: number | undefined,
    transform: (current: unknown) => unknown,
  ): Promise<boolean> {
    const held = gate
    if (held) await held
    const failure = failures.shift()
    if (failure !== undefined) throw failure
    if (refusals > 0) {
      refusals -= 1
      return false
    }
    if (expectedRevision !== undefined && expectedRevision !== revision) return false
    document = transform(document)
    revision += 1
    publish()
    return true
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get mutations() {
      return mutations
    },
    get listenerCount() {
      return listeners.size
    },
    async mutate(ops, expectedRevision) {
      mutations.push({ ops: [...ops], expectedRevision })
      return await write(expectedRevision, current => {
        let next = current
        for (const op of ops) next = applyOp(next, op)
        return next
      })
    },
    async set(field, value) {
      return await write(undefined, current => setPath(isRecord(current) ? current : {}, [field], value))
    },
    async unset(field) {
      return await write(undefined, current => unsetPath(isRecord(current) ? current : {}, [field]))
    },
    commitExternally(next) {
      document = next
      revision += 1
      publish()
    },
    replaceDocument(next) {
      document = next
      publish()
    },
    failNextWrite(reason) {
      failures.push(reason)
    },
    refuseNextWrite() {
      refusals += 1
    },
    holdWrites() {
      let release = (): void => {}
      gate = new Promise<void>(resolve => {
        release = () => {
          gate = null
          resolve()
        }
      })
      return release
    },
    setStatus(next) {
      status = next
      publish()
    },
    setWritable(next) {
      writable = next
      publish()
    },
  }
}
