#!/usr/bin/env node
// Gate: the tarball npm would publish must carry the bundle patch, the browser half,
// and the built host — and must not carry sources, tests, or the local evidence tree.
//
// Nothing else in this repo checks the publish artifact: `files` in package.json and the
// `dsh` manifest are metadata, and a wrong value ships silently. npm cannot take a
// version back, so this runs before every publish.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Paths every install of this bundle needs. */
const REQUIRED_ENTRIES = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/client.js',
  'README.md',
  'LICENSE',
]

/** Directories that must never reach the registry. */
const FORBIDDEN_PREFIXES = [
  'src/',
  'tests/',
  'tools/',
  'node_modules/',
  'artifacts/',
  'test-results/',
  '.github/',
]

function fail(message) {
  console.error(`::error::${message}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))

// `private: true` makes `npm publish` refuse; catching it here explains why.
if (manifest.private === true) {
  fail('package.json is still private:true — npm publish would refuse')
}
if (typeof manifest.name !== 'string' || manifest.name === '') {
  fail('package.json has no name')
}

const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }))
const [info] = packed
if (info === undefined) {
  fail('npm pack --dry-run --json returned no package')
}

if (info.name !== manifest.name || info.version !== manifest.version) {
  fail(`tarball is ${info.name}@${info.version}, manifest is ${manifest.name}@${manifest.version}`)
}

const entries = new Set(info.files.map((file) => file.path))

for (const required of REQUIRED_ENTRIES) {
  if (!entries.has(required)) {
    fail(`tarball is missing ${required} — check the "files" field in package.json`)
  }
}

for (const entry of entries) {
  const forbidden = FORBIDDEN_PREFIXES.find((prefix) => entry.startsWith(prefix))
  if (forbidden !== undefined) {
    fail(`tarball carries ${entry} — the published package must not include ${forbidden}`)
  }
}

// The manifest contract DSH reads when it loads the installed bundle.
const patch = manifest.dsh?.bundle?.patch
if (patch !== './cordis.patch.yml') {
  fail(`dsh.bundle.patch is ${JSON.stringify(patch)}, expected "./cordis.patch.yml"`)
}
if (manifest.dsh?.client === undefined) {
  fail('dsh.client is missing — the browser half would not be registered')
}

console.log(
  `tarball ok: ${info.name}@${info.version}, ${String(info.entryCount)} files, ${String(info.size)} bytes`,
)
