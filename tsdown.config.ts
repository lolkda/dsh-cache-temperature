import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

// The browser half registers itself under the package name: DSH resolves a client module
// by the name in package.json, so the artifact has to agree with the manifest. Read it
// instead of repeating it — a rename that misses this banner is a bundle nobody can load,
// and tests/integration/built-artifacts.test.ts compares the two.
const MANIFEST = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { name: string }

export default defineConfig([
  {
    entry: { index: 'src/host/index.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node24',
    outDir: 'lib',
    clean: false,
    dts: false,
    external: [/^@deepseek-ai\//, /^node:/],
  },
  {
    entry: { client: 'src/client/index.ts' },
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    clean: false,
    dts: false,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    noExternal: ['@deepseek-ai/schemastery', 'zod'],
    outExtensions: () => ({ js: '.js' }),
    outputOptions: {
      banner: `window.__ModuleLoader__.load({id:"${MANIFEST.name}",factory(require){const module={exports:{}};const exports=module.exports;`,
      footer: 'return module.exports;}});',
    },
  },
])
