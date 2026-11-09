/**
 * Verify that the profile can resolve the plugin package and that its host
 * half exports what the loader expects.
 *
 *   node tools/check-resolve.mjs
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { profileDir } from './lib/auth.mjs'

const require = createRequire(pathToFileURL(join(profileDir(), 'package.json')).href)
try {
  const resolved = require.resolve('@deepseek-ai/dsh-usage-preview')
  const mod = await import(pathToFileURL(resolved).href)
  console.log('resolved:', resolved)
  console.log('exports:', Object.keys(mod).join(','))
  console.log('inject:', JSON.stringify(mod.inject))
} catch (error) {
  console.error('FAIL:', error && error.message)
  process.exitCode = 1
}
