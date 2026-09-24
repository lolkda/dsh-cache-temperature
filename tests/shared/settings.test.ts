import { describe, expect, it } from 'vitest'
import * as api from '../../src/shared/settings.ts'

describe('session keepalive settings contract', () => {
  it('provides enabled, four-minute and thirty-minute defaults', () => {
    expect(api.DEFAULT_SESSION_SETTINGS).toEqual({ enabled: true, intervalMs: 240_000, idleTimeoutMs: 1_800_000 })
    expect(Object.isFrozen(api.DEFAULT_SESSION_SETTINGS)).toBe(true)
    expect(api.SETTINGS_NAMESPACE).toBe('cache-keepalive')
    expect(api.KEEPALIVE_REQUEST_TIMEOUT_MS).toBe(90_000)
  })

  it('resolves an empty document without persisting default session entries', () => {
    expect(api.decodeSettingsDocument({})).toEqual({ sessions: {} })
  })

  it('fills missing per-session fields while preserving explicit disablement', () => {
    expect(api.decodeSettingsDocument({ sessions: { a: { enabled: false } } })).toEqual({
      sessions: { a: { enabled: false, intervalMs: 240_000, idleTimeoutMs: 1_800_000 } },
    })
  })

  it('keeps one session override isolated from another session', () => {
    const document = api.decodeSettingsDocument({ sessions: { a: { enabled: false, intervalMs: 60_000 } } })
    expect(api.getSessionSettings(document, 'a')).toEqual({ enabled: false, intervalMs: 60_000, idleTimeoutMs: 1_800_000 })
    expect(api.getSessionSettings(document, 'b')).toEqual(api.DEFAULT_SESSION_SETTINGS)
  })

  it.each([999, 2_147_483_648, 1_000.5, NaN, Infinity, -1, '240000'])(
    'rejects invalid millisecond durations: %s', value => {
      expect(() => api.decodeSettingsDocument({ sessions: { a: { intervalMs: value } } })).toThrow()
      expect(() => api.decodeSettingsDocument({ sessions: { a: { idleTimeoutMs: value } } })).toThrow()
    },
  )

  it('allows an idle window shorter than the refresh interval', () => {
    const document = api.decodeSettingsDocument({ sessions: { a: { intervalMs: 240_000, idleTimeoutMs: 60_000 } } })
    expect(api.getSessionSettings(document, 'a').idleTimeoutMs).toBe(60_000)
  })

  it('rejects malformed settings instead of silently displaying success', () => {
    for (const value of [null, [], { sessions: [] }, { sessions: { a: { enabled: 'false' } } }, { typo: true }]) {
      expect(() => api.decodeSettingsDocument(value)).toThrow()
    }
  })

  it('converts fractional minutes to nearest integer milliseconds', () => {
    expect(api.minutesToMilliseconds(1.5)).toBe(90_000)
    expect(api.minutesToMilliseconds(1 / 60)).toBe(1_000)
    expect(api.minutesToMilliseconds(1.00000001)).toBe(60_000)
  })

  it.each([0, -1, NaN, Infinity, 0.001, 40_000])('rejects invalid minutes: %s', value => {
    expect(() => api.minutesToMilliseconds(value)).toThrow()
  })
})
