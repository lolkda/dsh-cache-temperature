import { describe, expect, it } from 'vitest'

import {
  installKeepaliveControl,
  type KeepaliveDictionaries,
  type KeepaliveEntryOptions,
  type KeepalivePluginHost,
} from '../../src/client/plugin.ts'
import { createFakeForm, storedSessionEntry, type FakeForm } from './fake-form.ts'

const SESSION = 'session-b'

/** Build the plugin host seam over a fake form, recording every call it receives. */
function createHost(form: FakeForm = createFakeForm({ document: { sessions: {} } })) {
  const entries: KeepaliveEntryOptions[] = []
  const registered: KeepaliveDictionaries[] = []
  const entryIds: string[] = []
  const cleanups: (() => void)[] = []
  const host: KeepalivePluginHost = {
    effect: (callback, _label) => {
      const cleanup = callback()
      if (cleanup !== undefined) cleanups.push(cleanup)
    },
    registerDictionaries: dictionaries => {
      registered.push(dictionaries)
      return () => {}
    },
    formFor: entryId => {
      entryIds.push(entryId)
      return form
    },
    registerControl: options => {
      entries.push(options)
      return () => {}
    },
  }
  return { host, form, entries, registered, entryIds, cleanups }
}

/** Read the first registered entry, failing loudly when the plugin registered none. */
function firstEntry(entries: readonly KeepaliveEntryOptions[]): KeepaliveEntryOptions {
  const entry = entries[0]
  if (entry === undefined) throw new Error('the plugin registered no composer-left entry')
  return entry
}

/** Read the first registered dictionary pair, failing loudly when none was registered. */
function firstDictionaries(registered: readonly KeepaliveDictionaries[]): KeepaliveDictionaries {
  const dictionaries = registered[0]
  if (dictionaries === undefined) throw new Error('the plugin registered no dictionaries')
  return dictionaries
}

describe('keepalive plugin wiring', () => {
  it('registers complete dictionaries for both shipped locales', () => {
    const harness = createHost()

    installKeepaliveControl(harness.host)

    const dictionaries = firstDictionaries(harness.registered)
    expect(Object.keys(dictionaries.en).sort()).toEqual(Object.keys(dictionaries.zh).sort())
    expect(dictionaries.en['switchLabel']).toBe('Prompt cache keepalive')
    expect(dictionaries.zh['compactLabel']).toBe('保温')
  })

  it('resolves the keepalive settings form by the entry id the profile composes', () => {
    const harness = createHost()

    installKeepaliveControl(harness.host)

    expect(harness.entryIds).toEqual(['cache-keepalive'])
  })

  it('contributes one compact entry to the composer left tool row', () => {
    const harness = createHost()

    installKeepaliveControl(harness.host)

    expect(harness.entries).toHaveLength(1)
    const entry = firstEntry(harness.entries)
    expect(entry.name).toBe('conversation.input.left')
    expect(entry.id).toBe('cache-keepalive')
    expect(entry.locale).toBe('cache-keepalive')
    expect(entry.order).toBeGreaterThan(0)
  })

  it('addresses the control to the session the slot resolves', () => {
    const harness = createHost(createFakeForm({
      document: { sessions: { [SESSION]: { enabled: false, intervalMs: 60_000, idleTimeoutMs: 60_000 } } },
    }))
    installKeepaliveControl(harness.host)

    const face = firstEntry(harness.entries).inject(SESSION)

    expect(face.hooks.keepalive.getSnapshot().settings).toEqual({
      enabled: false,
      intervalMs: 60_000,
      idleTimeoutMs: 60_000,
    })
  })

  it('writes the addressed session without touching another one', async () => {
    const harness = createHost(createFakeForm({
      document: { sessions: { 'session-c': { enabled: false, intervalMs: 60_000, idleTimeoutMs: 60_000 } } },
    }))
    installKeepaliveControl(harness.host)
    const face = firstEntry(harness.entries).inject(SESSION)

    await face.setEnabled(true)
    await face.setIntervalMinutes(4.5)

    expect(storedSessionEntry(harness.form, SESSION)).toEqual({ enabled: true, intervalMs: 270_000 })
    expect(storedSessionEntry(harness.form, 'session-c')).toEqual({
      enabled: false,
      intervalMs: 60_000,
      idleTimeoutMs: 60_000,
    })
  })

  it('reuses one control per session and separates different sessions', () => {
    const harness = createHost()
    installKeepaliveControl(harness.host)
    const entry = firstEntry(harness.entries)

    const first = entry.inject(SESSION)
    const again = entry.inject(SESSION)
    const other = entry.inject('session-z')

    expect(again.hooks.keepalive).toBe(first.hooks.keepalive)
    expect(other.hooks.keepalive).not.toBe(first.hooks.keepalive)
  })

  it('drops the cached controls when the plugin unloads', () => {
    const harness = createHost()
    installKeepaliveControl(harness.host)
    const entry = firstEntry(harness.entries)
    const before = entry.inject(SESSION)

    for (const cleanup of harness.cleanups) cleanup()

    expect(entry.inject(SESSION).hooks.keepalive).not.toBe(before.hooks.keepalive)
  })
})
