import { defineConfig } from 'tsdown'

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
      banner: 'window.__ModuleLoader__.load({id:"@local/dsh-cache-temperature",factory(require){const module={exports:{}};const exports=module.exports;',
      footer: 'return module.exports;}});',
    },
  },
])
