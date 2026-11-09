/**
 * Enable (or disable) a plugin entry on the running profile through the
 * plugin manager, which applies the change live.
 *
 *   node tools/diag-enable.mjs <port> [entry-id] [true|false]
 */
import { mintCookie, callApi } from './lib/auth.mjs'

const port = process.argv[2]
if (port === undefined) throw new Error('usage: node tools/diag-enable.mjs <port> [entry-id] [true|false]')
const entryId = process.argv[3] ?? 'include:usage-preview'
const enabled = process.argv[4] !== 'false'
const authority = `127.0.0.1:${port}`

const result = await callApi(authority, mintCookie(authority), 'pluginManager', 'setPluginEnabled', { id: entryId, enabled })
console.log(JSON.stringify(result, null, 2))
