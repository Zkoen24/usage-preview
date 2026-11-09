/**
 * Shared helpers for the local diagnostics: the harness home, the browser
 * session cookie minted from the managed credential record, and the plugin
 * manager's authenticated API call. Local-only, read-only unless a script
 * explicitly changes something.
 */
import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The harness home: `$DSH_HOME`, else `~/.dsh`. */
export function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** The profile directory the desktop app boots (`desktop` unless overridden). */
export function profileDir(name = process.env.DSH_PROFILE ?? 'desktop') {
  return join(dshHome(), 'profiles', name)
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

/**
 * Mint the browser-session cookie for one authority from the local
 * `client-connection/browser-session` credential record.
 * @param {string} authority - `host:port` of the running app.
 * @returns {string} the `Cookie` header value.
 */
export function mintCookie(authority) {
  const yaml = readFileSync(join(dshHome(), '.credentials.yaml'), 'utf8')
  const match = /client-connection\/browser-session:\s*\r?\n\s*kind:\s*grant\s*\r?\n\s*payload:\s*\r?\n\s*version:\s*1\s*\r?\n\s*secret:\s*([A-Za-z0-9_-]+)/.exec(yaml)
  if (match === null) throw new Error('browser-session secret not found in .credentials.yaml')
  const encoded = match[1].replaceAll('-', '+').replaceAll('_', '/')
  const secret = Buffer.from(encoded + '='.repeat((4 - (encoded.length % 4)) % 4), 'base64')
  const issuedAt = Date.now()
  const expiresAt = issuedAt + 30 * 86400000
  const body = encodeBase64Url(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }))
  const signature = encodeBase64Url(createHmac('sha256', secret).update(body).digest())
  const name = 'dsh-auth-' + encodeBase64Url(createHash('sha256').update(authority).digest())
  return `${name}=v1.${body}.${signature}`
}

/**
 * Call one authenticated gateway method.
 * @param {string} authority - `host:port`.
 * @param {string} cookie - `Cookie` header value.
 * @param {string} namespace - remote namespace, e.g. `pluginInventory`.
 * @param {string} method - method name, e.g. `list`.
 * @param {object} args - method arguments.
 * @returns {object} the RPC result envelope body.
 */
export async function callApi(authority, cookie, namespace, method, args = {}) {
  const rpcId = Math.random().toString(16).slice(2)
  const response = await fetch(`http://${authority}/api/${namespace}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId, method: `${namespace}/${method}`, payload: { args } }),
  })
  const text = await response.text()
  try {
    return JSON.parse(text).result
  } catch {
    return { raw: text.slice(0, 500) }
  }
}
