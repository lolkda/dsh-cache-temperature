import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { describe, expect, it } from 'vitest'
import { IntegrationHarness, SESSION_A } from './harness.ts'
import { SlotLedgerService, declareSlot } from './slot-ledger.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const HOST_ARTIFACT = join(ROOT, 'lib', 'index.js')
const CLIENT_ARTIFACT = join(ROOT, 'lib', 'client.js')
const PROFILE = join(process.env['DSH_HOME'] ?? join(homedir(), '.dsh'), 'profiles', 'web')

/** Browser module-table names the shell always answers, so they need no declaration. */
const BASELINE_CLIENT_MODULES = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']

interface PackageManifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  dsh?: { client?: { platform?: string; inject?: string[]; external?: string[] } }
}

const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageManifest

/** Every bare module specifier a bundle imports or requires. */
function bareSpecifiers(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(/(?:from|require\()\s*["']([^"']+)["']/g)) {
    const specifier = match[1]
    if (specifier === undefined) continue
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
    found.add(specifier)
  }
  return [...found]
}

interface ClientBundleDefinition {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => unknown
}

/** The two browser modules the client half is allowed to require. */
function clientModuleStub(specifier: string): unknown {
  if (specifier === 'react') {
    return {
      __esModule: true,
      default: {},
      createElement: () => ({}),
      useState: () => [undefined, () => {}],
      useId: () => 'generated-id',
    }
  }
  if (specifier === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: 'Fragment' }
  throw new Error(`the client bundle required an undeclared module: ${specifier}`)
}

/** A settings form that never serves a value; the artifact suites exercise wiring only. */
function inertForm(): ConfigForm<unknown> {
  return {
    getSnapshot: () => ({
      status: 'loading',
      value: undefined,
      base: undefined,
      user: undefined,
      revision: undefined,
      writable: false,
      mode: 'memory',
    }),
    subscribe: () => () => {},
    mutate: async () => true,
    set: async () => true,
    unset: async () => true,
  }
}

/** The browser evaluates one classic script once; so does this loader. */
let clientDefinition: ClientBundleDefinition | undefined

/** Load the built client bundle exactly as the browser does: one classic script. */
async function loadClientBundle(): Promise<ClientBundleDefinition> {
  if (clientDefinition !== undefined) return clientDefinition
  expect(existsSync(CLIENT_ARTIFACT), 'lib/client.js is missing; run the release build first').toBe(true)
  const loaded: ClientBundleDefinition[] = []
  const globals = globalThis as { window?: unknown }
  const previous = globals.window
  globals.window = {
    __ModuleLoader__: {
      load: (definition: ClientBundleDefinition) => {
        loaded.push(definition)
      },
    },
  }
  try {
    await import(pathToFileURL(CLIENT_ARTIFACT).href)
  } finally {
    globals.window = previous
  }
  expect(loaded).toHaveLength(1)
  clientDefinition = loaded[0] as ClientBundleDefinition
  return clientDefinition
}

describe('built host artifact', () => {
  it('exports the Cordis plugin surface', async () => {
    expect(existsSync(HOST_ARTIFACT), 'lib/index.js is missing; run the release build first').toBe(true)
    const artifact = (await import(pathToFileURL(HOST_ARTIFACT).href)) as Record<string, unknown>
    expect(typeof artifact['name']).toBe('string')
    expect(Array.isArray(artifact['inject'])).toBe(true)
    expect(typeof artifact['apply']).toBe('function')
  })

  it('keeps every module external, including the dsh-llm identity module', () => {
    const source = readFileSync(HOST_ARTIFACT, 'utf8')
    const allowed = new Set([
      ...Object.keys(MANIFEST.dependencies ?? {}),
      ...Object.keys(MANIFEST.peerDependencies ?? {}),
    ])
    for (const specifier of bareSpecifiers(source)) {
      expect(allowed.has(specifier), `${specifier} is bundled but not a declared dependency`).toBe(true)
    }
    // The agent-loop marker is a module-local WeakSet inside dsh-llm: an inlined
    // copy would silently stop matching the loop's own request objects.
    expect(bareSpecifiers(source)).toContain('@deepseek-ai/dsh-llm')
    expect(source).not.toContain('AGENT_LOOP_REQUESTS')
  })

  it('captures and replays a real request when mounted from the artifact', async () => {
    const artifact = (await import(pathToFileURL(HOST_ARTIFACT).href)) as {
      name: string
      inject: string[]
      apply: (ctx: Context, config: unknown) => void
      Config: unknown
    }
    // The Loader resolves the ARTIFACT's own Config: mounting the workspace
    // schema here would validate the source tree instead of the shipped bundle.
    expect(artifact.Config, 'the artifact must export its Loader-resolved Config').toBeDefined()
    const harness = await IntegrationHarness.mount({ plugin: artifact })
    harness.useFakeTimers()
    try {
      // The settings namespace exists only if the Loader resolved that schema,
      // and it declares the session dictionary the artifact's own code reads.
      expect(harness.namespaceRegistered()).toBe(true)
      expect(JSON.stringify(harness.namespaceSchema())).toContain('sessions')
      await harness.runTurn(SESSION_A)
      harness.adapter.scriptCalls('complete')
      await harness.advance(240_000)

      const warm = harness.warmCalls()
      expect(warm).toHaveLength(1)
      expect(warm[0]?.options.maxTokens).toBe(1)
      expect(warm[0]?.marked).toBe(false)
      expect(warm[0]?.options.sessionId).toBe(SESSION_A)
      expect(harness.counters.toolDispatches).toBe(0)
    } finally {
      harness.useRealTimers()
      await harness.dispose()
    }
  })
})

describe('built client artifact', () => {
  it('registers one factory under the package name and returns plugin exports', async () => {
    const definition = await loadClientBundle()
    expect(definition.id).toBe(MANIFEST.name)
    const exportsValue = definition.factory(clientModuleStub) as Record<string, unknown>
    // A plugin export, not a second application: no default export, no component.
    expect('default' in exportsValue).toBe(false)
    expect(exportsValue['inject']).toEqual(['slots', 'configForms', 'locale'])
    expect(typeof exportsValue['apply']).toBe('function')
  })

  it('requires only baseline modules and leaves no undeclared external', () => {
    const source = readFileSync(CLIENT_ARTIFACT, 'utf8')
    const allowed = new Set([
      ...BASELINE_CLIENT_MODULES,
      ...(MANIFEST.dsh?.client?.external ?? []),
      ...(MANIFEST.dsh?.client?.inject ?? []),
    ])
    const specifiers = bareSpecifiers(source)
    expect(specifiers).toContain('react')
    for (const specifier of specifiers) {
      expect(allowed.has(specifier), `${specifier} is required but neither baseline nor declared`).toBe(true)
    }
    // No DSH client package was inlined: the module table keeps one shared instance.
    expect(source).not.toContain('@deepseek-ai/dsh-client-ui-slots')
    expect(source).not.toContain('@deepseek-ai/dsh-client-ui-settings')
    expect(source).not.toContain('is not declared (a parent entry')
  })

  it('registers its control into the real slot ledger from the built bundle', async () => {
    const definition = await loadClientBundle()
    const exportsValue = definition.factory(clientModuleStub) as {
      inject: string[]
      apply: (ctx: Context) => void
    }
    const core = new SlotCore()
    const ctx = new Context()
    ctx.plugin(SlotLedgerService, { core })
    ctx.provide('locale', { register: () => () => {} })
    ctx.provide('configForms', { get: () => inertForm() })
    const fiber = ctx.plugin({ name: MANIFEST.name, inject: exportsValue.inject, apply: exportsValue.apply })
    await fiber
    declareSlot(core)

    const entries = core.entries('conversation.input.left')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.options.id).toBe('cache-keepalive')
    await fiber.dispose()
    expect(core.entries('conversation.input.left')).toHaveLength(0)
  })
})

/**
 * The installed half of the identity question. `isAgentLoopRequest` compares
 * against a WeakSet private to one physical dsh-llm module, so a second copy
 * reachable from the installed bundle would make every real agent-loop request
 * look hand-built and keepalive would never capture a snapshot. A profile
 * install must therefore be a real directory inside the profile (never a
 * symlink back to the workspace, whose node_modules holds the workspace copies)
 * and must not shadow the installation's module closure.
 */
describe('installed module identity', () => {
  it.runIf(existsSync(PROFILE))('keeps a single physical dsh-llm for the plugin and the agent loop', () => {
    const modulesDir = join(PROFILE, 'node_modules')
    for (const name of ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-tools']) {
      expect(
        existsSync(join(modulesDir, name)),
        `${name} must not be installed into the profile: a second physical copy breaks the module-local agent-loop marker identity`,
      ).toBe(false)
    }

    const installed = join(modulesDir, MANIFEST.name)
    if (!existsSync(installed)) return
    expect(
      lstatSync(installed).isSymbolicLink(),
      'a symlinked install resolves to the workspace, whose node_modules holds a second dsh-llm copy',
    ).toBe(false)
    const profile = JSON.parse(readFileSync(join(PROFILE, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(profile.dependencies?.[MANIFEST.name]).toMatch(/\.tgz$/)
  })
})
