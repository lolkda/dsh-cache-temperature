import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { boot, initProfile, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import type { Entry, EntryOptions } from '@deepseek-ai/cordis-plugin-loader'

/** Bundle directory name this fixture writes its composed entries into. */
const BUNDLE = 'cache-keepalive-test-bundle'

/** One entry this fixture composes into the temporary profile, mounted by the real Loader. */
export interface ProfileEntry {
  /** Loader entry id; the Host settings namespace is exactly this id. */
  readonly id: string
  /** Builtin name (without the `cordis:` prefix) the fixture resolves this entry against. */
  readonly name: string
  /** The plugin module the Loader mounts. */
  readonly plugin: unknown
  /** Raw entry config, exactly as the profile patch would carry it. */
  readonly config?: Record<string, unknown>
}

/** A real profile boot: Loader, composed entries, and the persisted patch document. */
export interface ProfileFixture {
  readonly ctx: Context
  readonly profile: ProfileContext
  /** Temporary Harness home; nothing outside it is written. */
  readonly home: string
  /** The profile patch document as the Host persisted it. */
  patchDocument(): string
  /** One live Loader entry by id. */
  entry(id: string): Entry
  /** Unload (`true`) or remount (`false`) one entry, as a plugin unload does. */
  setEntryDisabled(id: string, disabled: boolean): Promise<void>
  /** Dispose the whole runtime and remove the temporary home. */
  dispose(): Promise<void>
}

/**
 * Boot the real profile runtime this plugin ships into: a temporary Harness
 * home, a composed bundle patch, the deployment's own Loader, configuration
 * editor, and settings forms, plus the supplied entries.
 *
 * Only the Harness home is temporary: the entries, their configs, and every
 * settings write go through the Loader's own patch document, so a settings
 * write exercises the same path a user's configuration edit does.
 * @param options - entries to compose and an optional legacy `settings.yaml` body.
 * @returns the live profile fixture.
 */
export async function bootProfile(options: {
  readonly entries: readonly ProfileEntry[]
  /** Legacy document body written before boot, so the Host imports it during startup. */
  readonly legacySettings?: string
}): Promise<ProfileFixture> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'cache-keepalive-profile-')))
  const dir = join(home, 'profiles', 'test')
  initProfile(dir, [BUNDLE])
  const bundle = join(dir, 'node_modules', BUNDLE)
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"cache-keepalive-test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({
    name: BUNDLE, version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{
    insert: options.entries.map(entry => composeEntryOptions(entry)),
  }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  if (options.legacySettings !== undefined) {
    writeFileSync(join(home, 'settings.yaml'), options.legacySettings)
  }
  const profile: ProfileContext = {
    name: 'test',
    startedBundles: [BUNDLE],
    dir,
    patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'),
    cwd: home,
    home,
    overlays: [],
    telemetryDisabledEnv: undefined,
  }
  const ctx = await boot('cache-keepalive-test', join(dir, 'cordis.yml'), readProfilePatches('cache-keepalive-test', profile), root => {
    root.provide('profileContext', profile)
    Object.assign(root.loader.builtins, Object.fromEntries(
      options.entries.map(entry => [entry.name, entry.plugin]),
    ))
  })
  const fixture: ProfileFixture = {
    ctx,
    profile,
    home,
    patchDocument: () => readFileSync(profile.patchPath, 'utf8'),
    entry: (id: string): Entry => {
      const found = [...ctx.loader.entries()].find(row => row.options.id === id)
      if (found === undefined) throw new Error(`the profile has no entry "${id}"`)
      return found
    },
    setEntryDisabled: async (id: string, disabled: boolean): Promise<void> => {
      await fixture.entry(id).update({ disabled })
    },
    dispose: async (): Promise<void> => {
      await ctx.fiber.dispose()
      rmSync(home, { recursive: true, force: true })
    },
  }
  return fixture
}

/** One entry's persisted options, omitting an absent config rather than storing `undefined`. */
function composeEntryOptions(entry: ProfileEntry): EntryOptions {
  return {
    id: entry.id,
    name: `cordis:${entry.name}`,
    ...entry.config === undefined ? {} : { config: entry.config },
  }
}
