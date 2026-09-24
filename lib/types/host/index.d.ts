import type { Context } from '@deepseek-ai/cordis';
import { type KeepaliveConfig } from '../shared/settings.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "cache-temperature";
/** Services this plugin needs: the model runtime it replays through. */
export declare const inject: string[];
/**
 * The plugin's own configuration schema.
 *
 * The rc.1 Loader resolves this schema and hands the plugin the validated
 * `Config`; the session dictionary is a volatile field, so a settings write
 * commits into the running reference without remounting the plugin. The
 * namespace a configuration surface addresses is the Loader entry id.
 */
export declare const Config: import("@deepseek-ai/schemastery").default<import("../shared/settings.ts").KeepaliveConfigInput, KeepaliveConfig>;
/**
 * Mount per-session prompt-cache keepalive.
 *
 * Session preferences live in the plugin's own `Config`, keyed by session id.
 * Every timer and warm request belongs to the controller, which the plugin
 * fiber disposes on unload.
 *
 * @param ctx - the plugin context that owns the listeners.
 * @param config - the Loader-resolved configuration; its session dictionary is live.
 */
export declare function apply(ctx: Context, config: KeepaliveConfig): void;
