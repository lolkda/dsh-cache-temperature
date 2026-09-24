import type { Context } from '@deepseek-ai/cordis'
// The Loader owns the volatile config protocol and declares
// `loader/volatile-update`; importing its types is what makes the event known.
import type {} from '@deepseek-ai/cordis-plugin-loader'
// Declares the optional `ctx.settings` service this plugin only configures.
import type {} from '@deepseek-ai/dsh-settings'
import { settingsSchema, type KeepaliveConfig } from '../shared/settings.ts'
import { KeepaliveController } from './keepalive.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'cache-temperature'

/** Services this plugin needs: the model runtime it replays through. */
export const inject = ['llm']

/**
 * The plugin's own configuration schema.
 *
 * The rc.1 Loader resolves this schema and hands the plugin the validated
 * `Config`; the session dictionary is a volatile field, so a settings write
 * commits into the running reference without remounting the plugin. The
 * namespace a configuration surface addresses is the Loader entry id.
 */
export const Config = settingsSchema

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
export function apply(ctx: Context, config: KeepaliveConfig): void {
  const controller = new KeepaliveController(ctx, {
    get: () => ({ sessions: config.sessions.get() }),
  })
  ctx.effect(() => () => {
    controller.dispose()
  })
  ctx.on('llm/stream', (options, next) => controller.handleStream(options, next))
  ctx.on('tools/execute', (exec, next) => controller.handleTool(exec, next))
  ctx.on('agent/status', (payload) => {
    controller.setStatus(String(payload.agent.id), payload.status)
  })
  ctx.on('agent/disposed', (payload) => {
    controller.dropSession(String(payload.agent.id))
  })
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end') controller.endTurn(String(session.id), event.data.reason)
  })
  ctx.on('session/disposed', (session) => {
    controller.dropSession(String(session.id))
  })
  // The Loader commits a volatile-only settings change into the running config
  // and announces it on this fiber alone, so another plugin's write can never
  // re-plan these sessions.
  ctx.on('loader/volatile-update', () => {
    controller.settingsChanged()
  })
  // rc.1 auto-generates a settings page from the plugin's own Config, which for
  // this plugin would expose the raw session dictionary — every session id and
  // its stored durations — as a second, unowned surface. The preference is
  // presented by the composer control alone, so opt out of that page. The
  // policy belongs to this plugin's own fiber, and `settings` stays optional:
  // a deployment without the service simply registers no policy.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  // A plugin mounted into a live host never saw earlier status transitions, so
  // seed every agent that is already registered before its next transition.
  const agents = ctx.get('agents')
  if (agents !== undefined) {
    for (const agent of agents.list()) controller.setStatus(String(agent.id), agent.status)
  }
}
