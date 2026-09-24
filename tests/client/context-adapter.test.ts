import { describe, expect, it } from 'vitest'

import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'

import { KeepaliveControl } from '../../src/client/KeepaliveControl.tsx'
import { adaptContext, inject, type KeepaliveContextServices } from '../../src/client/index.ts'
import { keepaliveDictionaries } from '../../src/client/locales.ts'
import type { KeepaliveEntryOptions } from '../../src/client/plugin.ts'

/** Inert form double: this test only observes which entry the adapter asks for. */
function inertForm<T>(): ConfigForm<T> {
  return {
    getSnapshot: () => ({
      status: 'loading',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'host',
    }),
    subscribe: () => () => {},
    mutate: async () => true,
    set: async () => true,
    unset: async () => true,
  }
}

/** Build a client context double that records every contribution the adapter makes. */
function createServices() {
  const injected: string[] = []
  const registered: unknown[] = []
  const pending: (() => void)[] = []
  const entryIds: string[] = []
  const dictionaries: string[] = []
  const services: KeepaliveContextServices = {
    effect: callback => callback(),
    locale: {
      register: (...args: unknown[]) => {
        dictionaries.push(String(args[0]))
        return () => {}
      },
    },
    configForms: {
      get: <T,>(entryId: string) => {
        entryIds.push(entryId)
        return inertForm<T>()
      },
    },
    slots: {
      inject: (key, callback) => {
        injected.push(key)
        pending.push(() => {
          callback()
        })
        return () => {}
      },
      register: (options: unknown, _component: unknown) => {
        registered.push(options)
        return () => {}
      },
    },
  }
  return { services, injected, registered, pending, entryIds, dictionaries }
}

/** The entry this plugin contributes, with a resolver this adapter test never calls. */
const ENTRY: KeepaliveEntryOptions = {
  name: 'conversation.input.left',
  id: 'cache-keepalive',
  order: 10,
  locale: 'cache-keepalive',
  inject: () => {
    throw new Error('the adapter test never builds the business face')
  },
}

describe('client context adapter', () => {
  it('waits for the slot declaration instead of registering into an undeclared slot', () => {
    const harness = createServices()

    adaptContext(harness.services).registerControl(ENTRY, KeepaliveControl)

    expect(harness.injected).toEqual(['conversation.input.left'])
    expect(harness.registered).toHaveLength(0)
  })

  it('registers the entry once the declaration arrives', () => {
    const harness = createServices()
    adaptContext(harness.services).registerControl(ENTRY, KeepaliveControl)

    for (const run of harness.pending) run()

    expect(harness.registered).toEqual([ENTRY])
  })

  it('asks the settings form service for the keepalive entry', () => {
    const harness = createServices()

    adaptContext(harness.services).formFor('cache-keepalive')

    expect(harness.entryIds).toEqual(['cache-keepalive'])
  })

  it('requires the configForms service the settings transport moved to', () => {
    expect(inject).toEqual(['slots', 'configForms', 'locale'])
  })

  it('registers dictionaries for the keepalive locale namespace', () => {
    const harness = createServices()

    adaptContext(harness.services).registerDictionaries(keepaliveDictionaries)

    expect(harness.dictionaries).toEqual(['cache-keepalive'])
  })
})
