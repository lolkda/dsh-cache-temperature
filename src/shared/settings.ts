import type { Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const SETTINGS_NAMESPACE = 'cache-keepalive'
export const KEEPALIVE_REQUEST_TIMEOUT_MS = 90_000
export const MIN_DURATION_MS = 1_000
export const MAX_DURATION_MS = 2_147_483_647

export interface SessionKeepaliveSettings {
  readonly enabled: boolean
  readonly intervalMs: number
  readonly idleTimeoutMs: number
}

export interface KeepaliveSettingsDocument {
  readonly sessions: Record<string, SessionKeepaliveSettings>
}

export const DEFAULT_SESSION_SETTINGS: SessionKeepaliveSettings = Object.freeze({
  enabled: true,
  intervalMs: 240_000,
  idleTimeoutMs: 1_800_000,
})

const durationSchema = Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1)

/** Raw profile preferences may omit fields supplied by the schema defaults. */
export interface KeepaliveConfigInput {
  readonly sessions?: Record<string, Partial<SessionKeepaliveSettings>>
}

/** The Loader supplies a stable reference for the live session settings dictionary. */
export interface KeepaliveConfig {
  readonly sessions: Volatile<Record<string, SessionKeepaliveSettings>>
}

/**
 * One session's stored preference, with the schema supplying omitted fields.
 *
 * Every node in this subtree has to stay serializable. The Host projects the
 * plugin's `Config` into the envelope a browser settings form rehydrates with
 * `new Schema(envelope)` and then validates the served section against; a node
 * whose behavior lives in a JavaScript callback (`Schema.transform`) does not
 * survive that round trip, so the rehydrated copy would reject every stored
 * section and the form would stay at `loading` forever. Strict field checking
 * therefore rides the document's Standard Schema face instead — see
 * {@link settingsSchema}.
 */
export const sessionSettingsSchema: Schema<Partial<SessionKeepaliveSettings>, SessionKeepaliveSettings> = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_SESSION_SETTINGS.enabled),
  intervalMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1)
    .default(DEFAULT_SESSION_SETTINGS.intervalMs),
  idleTimeoutMs: Schema.number().min(MIN_DURATION_MS).max(MAX_DURATION_MS).step(1)
    .default(DEFAULT_SESSION_SETTINGS.idleTimeoutMs),
})

/** Loader-owned live configuration; persisted session values remain plain JSON. */
const documentSchema: Schema<KeepaliveConfigInput, KeepaliveConfig> = Schema.object({
  sessions: Schema.dict(sessionSettingsSchema).default({}).volatile(),
})

/**
 * The Loader-resolved configuration schema.
 *
 * The Loader validates a plugin's `Config` through its Standard Schema face
 * (`runtime.Config['~standard'].validate`), while the settings forms project the
 * same object through `toJSON()` for the browser. Composing both faces here
 * keeps the strict document check off the serialized envelope: the projected
 * subtree stays plain, so a browser form decodes every served section, and a
 * write carrying an unknown or invalid field is still refused before it can
 * reach the profile patch.
 */
export const settingsSchema: Schema<KeepaliveConfigInput, KeepaliveConfig> = withStrictDocument(
  documentSchema,
  decodeSettingsDocument,
)

/**
 * Add a strict document check to one schema's Standard Schema face.
 *
 * The supplied check runs only after the schema itself resolved the input, so
 * the resolved output — including the volatile session reference the Host
 * reads — stays the schema's own.
 *
 * @param schema - the document schema the Loader and the forms share.
 * @param checkDocument - rejects an input document this plugin cannot store.
 * @returns the same schema instance, with the strict face installed.
 */
function withStrictDocument<S extends Schema<KeepaliveConfigInput, KeepaliveConfig>>(
  schema: S,
  checkDocument: (value: unknown) => unknown,
): S {
  const standard = schema['~standard']
  Object.defineProperty(schema, '~standard', {
    configurable: true,
    value: {
      version: standard.version,
      vendor: standard.vendor,
      validate(value: unknown) {
        const result = standard.validate(value)
        if (!('then' in result) && result.issues === undefined) {
          checkDocument(value === undefined ? {} : value)
        }
        return result
      },
    },
  })
  return schema
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function validateDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError('Duration must be a finite integer number of milliseconds')
  }
  return durationSchema(value)
}

/** Validate one persisted session preference without accepting unknown fields. */
function decodeSessionSettings(input: unknown): SessionKeepaliveSettings {
  if (!isPlainRecord(input)
    || Object.keys(input).some(key => !['enabled', 'intervalMs', 'idleTimeoutMs'].includes(key))) {
    throw new TypeError('Invalid session keepalive settings')
  }
  const enabled = input.enabled === undefined ? DEFAULT_SESSION_SETTINGS.enabled : input.enabled
  if (typeof enabled !== 'boolean') throw new TypeError('Enabled must be a boolean')
  return {
    enabled,
    intervalMs: input.intervalMs === undefined
      ? DEFAULT_SESSION_SETTINGS.intervalMs : validateDuration(input.intervalMs),
    idleTimeoutMs: input.idleTimeoutMs === undefined
      ? DEFAULT_SESSION_SETTINGS.idleTimeoutMs : validateDuration(input.idleTimeoutMs),
  }
}

/** Validate the persistence boundary without coercion, then resolve defaults. */
export function decodeSettingsDocument(value: unknown): KeepaliveSettingsDocument {
  if (!isPlainRecord(value) || Object.keys(value).some(key => key !== 'sessions')) {
    throw new TypeError('Expected a keepalive settings document')
  }
  const sessions = value.sessions === undefined ? {} : value.sessions
  if (!isPlainRecord(sessions)) throw new TypeError('Expected a session settings dictionary')
  const entries: [string, SessionKeepaliveSettings][] = []
  for (const [id, input] of Object.entries(sessions)) {
    entries.push([id, decodeSessionSettings(input)])
  }
  return { sessions: Object.fromEntries(entries) }
}

/** Resolve only the selected session without creating persistent entries. */
export function getSessionSettings(
  document: KeepaliveSettingsDocument,
  sessionId: string,
): SessionKeepaliveSettings {
  return Object.hasOwn(document.sessions, sessionId)
    ? document.sessions[sessionId] ?? DEFAULT_SESSION_SETTINGS
    : DEFAULT_SESSION_SETTINGS
}

/** Convert user-facing minutes to bounded millisecond precision. */
export function minutesToMilliseconds(minutes: number): number {
  return validateDuration(Math.round(minutes * 60_000))
}
