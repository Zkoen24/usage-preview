/**
 * Validate the profile's `cordis.patch.yml` and print the rows it contributes.
 *
 *   node tools/check-patch.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { profileDir } from './lib/auth.mjs'

const require = createRequire(pathToFileURL(join(profileDir(), 'package.json')).href)
const yaml = require('yaml')
const file = join(profileDir(), 'cordis.patch.yml')

const parsed = yaml.parse(readFileSync(file, 'utf8'))
if (!Array.isArray(parsed)) throw new Error('patch root is not a top-level array')

const rows = []
for (const entry of parsed) {
  if (entry === null || typeof entry !== 'object') continue
  if (Array.isArray(entry.insert)) {
    for (const row of entry.insert) if (row !== null && typeof row === 'object' && typeof row.id === 'string') rows.push('insert:' + row.id)
  } else if (typeof entry.id === 'string') {
    rows.push('override:' + entry.id)
  }
}
console.log('parsed OK; entries:', parsed.length)
console.log('rows:', rows.join(', '))
