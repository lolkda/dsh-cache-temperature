import type { Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const SETTINGS_NAMESPACE = "cache-keepalive";
export declare const KEEPALIVE_REQUEST_TIMEOUT_MS = 90000;
export declare const MIN_DURATION_MS = 1000;
export declare const MAX_DURATION_MS = 2147483647;
export interface SessionKeepaliveSettings {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly idleTimeoutMs: number;
}
export interface KeepaliveSettingsDocument {
    readonly sessions: Record<string, SessionKeepaliveSettings>;
}
export declare const DEFAULT_SESSION_SETTINGS: SessionKeepaliveSettings;
/** Raw profile preferences may omit fields supplied by the schema defaults. */
export interface KeepaliveConfigInput {
    readonly sessions?: Record<string, Partial<SessionKeepaliveSettings>>;
}
/** The Loader supplies a stable reference for the live session settings dictionary. */
export interface KeepaliveConfig {
    readonly sessions: Volatile<Record<string, SessionKeepaliveSettings>>;
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
export declare const sessionSettingsSchema: Schema<Partial<SessionKeepaliveSettings>, SessionKeepaliveSettings>;
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
export declare const settingsSchema: Schema<KeepaliveConfigInput, KeepaliveConfig>;
/** Validate the persistence boundary without coercion, then resolve defaults. */
export declare function decodeSettingsDocument(value: unknown): KeepaliveSettingsDocument;
/** Resolve only the selected session without creating persistent entries. */
export declare function getSessionSettings(document: KeepaliveSettingsDocument, sessionId: string): SessionKeepaliveSettings;
/** Convert user-facing minutes to bounded millisecond precision. */
export declare function minutesToMilliseconds(minutes: number): number;
