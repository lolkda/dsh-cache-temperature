import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { boot, initProfile, loadOverlayPatches, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import SettingsForms from '@deepseek-ai/dsh-settings'
import { expect, it, onTestFinished } from 'vitest'
import { SETTINGS_NAMESPACE, decodeSettingsDocument, settingsSchema } from '../../src/shared/settings.ts'

/** The published identity: DSH resolves this bundle by the name in package.json, and
 * `cordis.patch.yml` has to name it — a mismatch is a bundle that never loads. */
const MANIFEST = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { name: string }

/** Native Loader and persistent configuration editor over a temporary profile. */
async function mountSettings(): Promise<Context> {
  const home = mkdtempSync(join(tmpdir(), 'cache-live-config-'))
  onTestFinished(() => rmSync(home, { recursive: true, force: true }))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, ['cache-test-bundle'])
  const bundle = join(dir, 'node_modules', 'cache-test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"cache-test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: 'cache-test-bundle', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: SETTINGS_NAMESPACE, name: 'cordis:cache-config', config: {
      sessions: {
        a: { enabled: true, intervalMs: 120_000, idleTimeoutMs: 600_000 },
        b: { enabled: false, intervalMs: 240_000, idleTimeoutMs: 1_800_000 },
      },
    } },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['cache-test-bundle'], dir,
    patchPath: join(dir, 'cordis.patch.yml'), installAnchor: join(home, 'package.json'),
    cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  const ctx = await boot('cache-test', join(dir, 'cordis.yml'), readProfilePatches('cache-test', profile), root => {
    root.provide('profileContext', profile)
    Object.assign(root.loader.builtins, {
      editor: ConfigEditor,
      settings: SettingsForms,
      'cache-config': { Config: settingsSchema, apply: () => {} },
    })
  })
  onTestFinished(async () => { await ctx.fiber.dispose() })
  return ctx
}

it('keeps the legacy settings namespace as the actual bundle entry id, under the published package name', () => {
  const patch = fileURLToPath(new URL('../../cordis.patch.yml', import.meta.url))
  expect(loadOverlayPatches('cache-test', patch)).toEqual([{ insert: [
    { id: SETTINGS_NAMESPACE, name: MANIFEST.name },
  ] }])
})

it('writes a session preference through native live config without remounting or replacing another session', async () => {
  const ctx = await mountSettings()
  const entry = [...ctx.loader.entries()].find(row => row.options.id === SETTINGS_NAMESPACE)
  const fiber = entry?.fiber
  expect(fiber).toBeDefined()
  await expect(ctx.settings.mutate(SETTINGS_NAMESPACE, [
    { op: 'set', path: ['sessions', 'a', 'enabled'], value: false },
  ])).resolves.toBeUndefined()
  const descriptor = ctx.settings.describe().find(row => row.ns === SETTINGS_NAMESPACE)
  expect(decodeSettingsDocument(descriptor?.value)).toEqual({ sessions: {
    a: { enabled: false, intervalMs: 120_000, idleTimeoutMs: 600_000 },
    b: { enabled: false, intervalMs: 240_000, idleTimeoutMs: 1_800_000 },
  } })
  expect(entry?.fiber).toBe(fiber)
})

it('rejects unknown session fields without changing the persisted preferences', async () => {
  const ctx = await mountSettings()
  const before = ctx.settings.describe().find(row => row.ns === SETTINGS_NAMESPACE)?.value
  await expect(ctx.settings.mutate(SETTINGS_NAMESPACE, [
    { op: 'set', path: ['sessions', 'a', 'typo'], value: true },
  ])).rejects.toThrow('Invalid session keepalive settings')
  expect(ctx.settings.describe().find(row => row.ns === SETTINGS_NAMESPACE)?.value).toEqual(before)
})
