import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'tests/live-probe/index.ts' },
  outDir: 'tests/live-probe/lib',
  format: 'esm',
  platform: 'node',
  target: 'node24',
  dts: false,
  external: [/^@deepseek-ai\//, /^node:/],
})
