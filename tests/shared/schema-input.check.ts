import { settingsSchema, type SessionKeepaliveSettings } from '../../src/shared/settings.ts'

// A persisted profile may override one field; schema defaults fill the others.
const config = settingsSchema({ sessions: { partial: { intervalMs: 5_000 } } })
const resolved: SessionKeepaliveSettings | undefined = config.sessions.get()['partial']
void resolved
