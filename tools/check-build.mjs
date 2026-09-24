#!/usr/bin/env node
// Gate: the committed `lib/` must be exactly what these sources build to.
//
// `lib/` ships inside the npm tarball and is what DSH loads, so a stale commit would
// hand every installer a build that does not correspond to the sources next to it.
// CI runs `pnpm build` first and then this script; any diff means the commit is stale.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/** Entry points the manifest advertises; a missing one would ship a broken tarball. */
const REQUIRED_OUTPUTS = ['lib/index.js', 'lib/client.js']

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

const missing = REQUIRED_OUTPUTS.filter((path) => !existsSync(path))
if (missing.length > 0) {
  console.error(`::error::build output missing: ${missing.join(', ')} — run \`pnpm build\``)
  process.exit(1)
}

// Scoped to lib/ on purpose: other working-tree changes are not this gate's business.
const dirty = git('status', '--porcelain', '--', 'lib').trim()
if (dirty !== '') {
  console.error('::error::committed lib/ is not a build of these sources:')
  console.error(dirty)
  console.error('run `pnpm build` and commit the result')
  process.exit(1)
}

console.log(`committed lib/ matches a fresh build (${REQUIRED_OUTPUTS.join(', ')})`)
