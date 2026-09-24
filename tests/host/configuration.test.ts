import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyHostPlugin, Config as hostConfig, inject as hostInject, name as hostPluginName } from '../../src/host/index.ts'
import { HostHarness, SESSION_ID } from './harness.ts'

/**
 * The rc.1 settings seam is the plugin's own `Config` schema: the Host no
 * longer registers a namespace, so the keepalive document must be reachable as
 * a live `Volatile` reference on the resolved config, and a volatile commit by
 * the Loader must re-plan every session without remounting the plugin.
 */
describe('host keepalive configuration seam', () => {
  it('exposes a Config schema whose sessions field is a live volatile reference', () => {
    const resolved = hostConfig({ sessions: { [SESSION_ID]: { intervalMs: 5_000 } } })
    expect(typeof resolved.sessions.get).toBe('function')
    expect(resolved.sessions.get()).toEqual({
      [SESSION_ID]: { enabled: true, intervalMs: 5_000, idleTimeoutMs: 1_800_000 },
    })
  })

  it('declares the model runtime as its only required service', () => {
    expect(hostInject).toEqual(['llm'])
  })

  it('reschedules every session when the Loader commits new volatile values', async () => {
    const harness = await HostHarness.mount()
    harness.useFakeTimers()
    try {
      await harness.setSettings(SESSION_ID, { intervalMs: 240_000 })
      await harness.request()
      harness.emitTurnEnd({ kind: 'completed' })
      await harness.flush()
      await harness.advance(60_000)
      expect(harness.warmCalls()).toHaveLength(0)

      await harness.setSettings(SESSION_ID, { intervalMs: 60_000 })
      await harness.advance(1)

      expect(harness.warmCalls()).toHaveLength(1)
    } finally {
      harness.useRealTimers()
      await harness.dispose()
    }
  })

  it('mounts without a settings service, because the Host owns the Config', async () => {
    const harness = await HostHarness.mount()
    try {
      expect(harness.ctx.get('settings')).toBeUndefined()
      expect(harness.settings.calls).toHaveLength(0)
      expect(hostPluginName).toBe('cache-temperature')
    } finally {
      await harness.dispose()
    }
  })

  it('suppresses the auto-generated page for the raw session dictionary', async () => {
    const harness = await HostHarness.mount({ settingsService: true })
    try {
      // The preference is presented by the composer control alone; an
      // auto-generated page would expose every session id and its stored
      // durations as a second, unowned settings surface.
      expect(harness.settings.calls).toHaveLength(1)
      expect(harness.settings.calls[0]!.presentation).toEqual({ auto: false })
    } finally {
      await harness.dispose()
    }
  })

  it('registers that page policy against its own fiber', async () => {
    const harness = await HostHarness.mount({ settingsService: true })
    try {
      expect(harness.settings.calls[0]!.owner).toBe(harness.ownFiber())
    } finally {
      await harness.dispose()
    }
  })

  it('releases the page policy when the plugin unloads', async () => {
    const harness = await HostHarness.mount({ settingsService: true })
    try {
      expect(harness.settings.calls).toHaveLength(1)
      await harness.disposePlugin()
      expect(harness.settings.calls).toHaveLength(0)
    } finally {
      await harness.dispose()
    }
  })

  it('adopts the page policy when the settings service arrives later', async () => {
    const harness = await HostHarness.mount()
    try {
      expect(harness.settings.calls).toHaveLength(0)
      harness.provideSettings()
      await harness.flush()
      expect(harness.settings.calls).toHaveLength(1)
      expect(harness.settings.calls[0]!.presentation).toEqual({ auto: false })
    } finally {
      await harness.dispose()
    }
  })

  it('ignores a volatile commit the Loader announces for another fiber', async () => {
    const harness = await HostHarness.mount()
    harness.useFakeTimers()
    try {
      await harness.setSettings(SESSION_ID, { intervalMs: 240_000 })
      await harness.request()
      harness.emitTurnEnd({ kind: 'completed' })
      await harness.flush()

      // A foreign fiber's commit changes the stored document but is dispatched
      // with a filter that excludes this plugin, so it must not re-plan here.
      await harness.setSettingsFromAnotherFiber(SESSION_ID, { intervalMs: 60_000 })
      await harness.advance(60_001)

      expect(harness.warmCalls()).toHaveLength(0)
    } finally {
      harness.useRealTimers()
      await harness.dispose()
    }
  })

  it('keeps the document readable after a volatile commit replaces it', async () => {
    const harness = await HostHarness.mount()
    try {
      await harness.setSettings(SESSION_ID, { enabled: false })
      const document = harness.settingsDocument()
      expect(document).toEqual({
        [SESSION_ID]: { enabled: false, intervalMs: 240_000, idleTimeoutMs: 1_800_000 },
      })
    } finally {
      await harness.dispose()
    }
  })
})

/** The plugin's apply signature accepts the resolved Config, never a settings scope. */
export type HostApply = (ctx: Context, config: ReturnType<typeof hostConfig>) => void
const applyCheck: HostApply = applyHostPlugin
void applyCheck
