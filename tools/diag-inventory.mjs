/**
 * List the running app's loader entries and report the plugin's fiber state
 * (active, disabled, or failed with a metadata error).
 *
 *   node tools/diag-inventory.mjs <port>
 */
import { mintCookie, callApi } from './lib/auth.mjs'

const port = process.argv[2]
if (port === undefined) throw new Error('usage: node tools/diag-inventory.mjs <port>')
const authority = `127.0.0.1:${port}`

const inventory = await callApi(authority, mintCookie(authority), 'pluginInventory', 'list', {})
const entries = inventory?.value?.entries ?? []
console.log('total entries:', entries.length)
const interesting = entries.filter((entry) => /usage-preview|vectorize/i.test(entry.moduleName ?? '') || /usage-preview|vectorize/i.test(entry.entryId ?? ''))
console.log('plugin entries:', JSON.stringify(interesting, null, 2))
const unhealthy = entries.filter((entry) => entry.enabled === true && entry.fiberPhase !== 'active')
console.log('enabled-but-not-active:', JSON.stringify(unhealthy.slice(0, 10)))
