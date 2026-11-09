/**
 * Read the running app's browser boot graph and look for the plugin entry.
 *
 *   node tools/diag-boot.mjs <port>
 */
import { mintCookie } from './lib/auth.mjs'

const port = process.argv[2]
if (port === undefined) throw new Error('usage: node tools/diag-boot.mjs <port>')
const authority = `127.0.0.1:${port}`
const cookie = mintCookie(authority)

const response = await fetch(`http://${authority}/`, { headers: { cookie, accept: 'text/html' } })
const html = await response.text()
const entries = [...html.matchAll(/"id":"([^"]+)"/g)].map((match) => match[1])
console.log('GET / ->', response.status, '| entries:', entries.length)
console.log('usage-preview entries:', JSON.stringify(entries.filter((id) => id.includes('usage-preview'))))
console.log('first entries:', entries.slice(0, 6).join(', '))
