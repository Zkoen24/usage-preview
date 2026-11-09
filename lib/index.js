/**
 * Usage-preview host half for the DeepSeek Harness 0.2.2 desktop runtime.
 *
 * Self-contained: every capability arrives through the Cordis Context, so the
 * plugin runs inside the packaged desktop host regardless of the packaged
 * package versions. Diagnostics go to `$DSH_HOME/usage-preview-debug.log`.
 *
 * Surface: one loopback RPC channel, `/usage-preview`, with two logical
 * operations —
 *   `providers` — the discoverable API keys (<= .credentials.yaml refs and
 *                 `*_API_KEY` environment variables) with balance adapters;
 *   `snapshot`  — the selected provider's balance plus token usage in three
 *                 windows (current session, today, all time).
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const VERSION = '0.4.0'
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const LOG_PATH = join(DSH_HOME, 'usage-preview-debug.log')

function log(message) {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [usage-preview ${VERSION}] ${message}\n`)
  } catch {
    // Diagnostics must never change the plugin's behavior.
  }
}

log('module evaluated')

const CHANNEL = '/usage-preview'
const ENDPOINT_PROVIDERS = 'providers'
const ENDPOINT_SNAPSHOT = 'snapshot'
const BALANCE_TIMEOUT_MS = 8_000
const BALANCE_OK_CACHE_MS = 60_000
const BALANCE_FAILURE_CACHE_MS = 15_000
const USAGE_CACHE_MS = 5_000
const PROVIDERS_CACHE_MS = 30_000

/** Known balance adapters keyed by credential reference. */
const KNOWN_PROVIDERS = {
  DEEPSEEK_API_KEY: { id: 'deepseek', label: 'DeepSeek 官方', kind: 'deepseek' },
  KIMI_CODING_API_KEY: { id: 'kimi-coding', label: 'Kimi Coding', kind: 'moonshot' },
  MOONSHOT_API_KEY: { id: 'moonshot', label: 'Moonshot', kind: 'moonshot' },
  OPENAI_API_KEY: { id: 'openai', label: 'OpenAI', kind: 'unsupported' },
}

/** Local-midnight epoch ms of the current day. */
function startOfLocalDay(now = Date.now()) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function emptyBucket() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}

function usageOf(usage) {
  const inputTokens = Number(usage.inputTokens ?? 0)
    + Number(usage.cacheReadTokens ?? 0)
    + Number(usage.cacheWriteTokens ?? 0)
  const outputTokens = Number(usage.outputTokens ?? 0)
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
}

function addBucket(left, right) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  }
}

function bucketFromView(view) {
  if (view === undefined || view === null) return emptyBucket()
  if (typeof view.inputTokens === 'number') {
    return usageOf({ inputTokens: view.inputTokens, outputTokens: view.outputTokens })
  }
  const inputTokens = Number(view.uncachedInputTokens ?? 0)
    + Number(view.cacheReadTokens ?? 0)
    + Number(view.cacheWriteTokens ?? 0)
  const outputTokens = Number(view.outputTokens ?? 0)
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
}

function foldEvents(events, since) {
  let acc = emptyBucket()
  if (!Array.isArray(events)) return acc
  for (const event of events) {
    if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') continue
    const usage = event.data === undefined || event.data === null ? undefined : event.data.usage
    if (usage === undefined || usage === null) continue
    if (since !== undefined && (typeof event.time !== 'number' || event.time < since)) continue
    acc = addBucket(acc, usageOf(usage))
  }
  return acc
}

function sessionEventsOf(session) {
  if (session === null || typeof session !== 'object') return []
  if (typeof session.snapshotEvents === 'function') return session.snapshotEvents()
  return Array.isArray(session.events) ? session.events : []
}

function revisionTime(revision) {
  if (typeof revision !== 'string') return undefined
  const parts = revision.split(':')
  const ns = Number(parts[3])
  return Number.isFinite(ns) && ns > 0 ? ns / 1e6 : undefined
}

/** Discover providers from the managed credential document and the environment. */
let providersCache
function discoverProviders() {
  const now = Date.now()
  if (providersCache !== undefined && providersCache.expiresAt > now) return providersCache.list

  const refs = new Set()
  try {
    const file = join(DSH_HOME, '.credentials.yaml')
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8')
      let inRefs = false
      for (const line of text.split(/\r?\n/)) {
        if (/^refs:\s*$/.test(line)) {
          inRefs = true
          continue
        }
        if (/^\S/.test(line)) {
          inRefs = false
          continue
        }
        if (!inRefs) continue
        const match = /^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line)
        if (match !== null) refs.add(match[1])
      }
    }
  } catch (error) {
    log(`credentials file unreadable: ${String(error)}`)
  }
  for (const key of Object.keys(process.env)) {
    if (/_API_KEY$/.test(key) && process.env[key] !== undefined && process.env[key] !== '') refs.add(key)
  }

  const list = []
  for (const ref of [...refs].sort()) {
    const known = KNOWN_PROVIDERS[ref]
    list.push({
      id: known !== undefined ? known.id : ref.replace(/_API_KEY$/, '').toLowerCase(),
      ref,
      label: known !== undefined ? known.label : ref.replace(/_API_KEY$/, ''),
      kind: known !== undefined ? known.kind : 'unsupported',
    })
  }
  providersCache = { expiresAt: now + PROVIDERS_CACHE_MS, list }
  log(`discovered ${list.length} provider(s): ${list.map((p) => p.ref).join(', ')}`)
  return list
}

function amount(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDeepseekBalance(body) {
  if (body === null || typeof body !== 'object') {
    return { ok: false, code: 'parse-failed', message: 'balance API returned a non-object body' }
  }
  const info = Array.isArray(body.balance_infos) ? body.balance_infos[0] : undefined
  if (info === undefined || info === null) {
    return { ok: false, code: 'parse-failed', message: 'balance API returned no balance_infos entry' }
  }
  return {
    ok: true,
    balance: {
      currency: typeof info.currency === 'string' ? info.currency : '',
      total: amount(info.total_balance),
      granted: amount(info.granted_balance),
      toppedUp: amount(info.topped_up_balance),
      isAvailable: body.is_available === true,
    },
  }
}

function parseMoonshotBalance(body) {
  if (body === null || typeof body !== 'object') {
    return { ok: false, code: 'parse-failed', message: 'balance API returned a non-object body' }
  }
  const data = body.data
  if (data === null || typeof data !== 'object') {
    return { ok: false, code: 'parse-failed', message: 'balance API returned no data entry' }
  }
  const total = amount(data.available_balance)
  return {
    ok: true,
    balance: {
      currency: 'CNY',
      total,
      granted: amount(data.voucher_balance),
      toppedUp: amount(data.cash_balance),
      isAvailable: true,
    },
  }
}

async function fetchBalance(kind, key, signal) {
  const timeout = AbortSignal.timeout(BALANCE_TIMEOUT_MS)
  const call = async (url) => {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.any([signal, timeout]),
    })
    return response
  }
  try {
    if (kind === 'deepseek') {
      const response = await call('https://api.deepseek.com/user/balance')
      if (!response.ok) return { ok: false, code: 'fetch-failed', message: `balance API answered HTTP ${response.status}` }
      return parseDeepseekBalance(await response.json())
    }
    if (kind === 'moonshot') {
      let lastStatus
      for (const url of ['https://api.moonshot.cn/v1/users/me/balance', 'https://api.moonshot.ai/v1/users/me/balance']) {
        const response = await call(url)
        lastStatus = response.status
        if (response.ok) return parseMoonshotBalance(await response.json())
      }
      return { ok: false, code: 'fetch-failed', message: `balance API answered HTTP ${lastStatus}` }
    }
    return { ok: false, code: 'unsupported', message: 'this API does not expose a balance endpoint' }
  } catch (error) {
    return { ok: false, code: 'fetch-failed', message: String(error) }
  }
}

const balanceCache = new Map()

async function readBalance(ctx, provider, signal) {
  const now = Date.now()
  const cached = balanceCache.get(provider.ref)
  if (cached !== undefined && cached.expiresAt > now) return cached.value

  const credentials = ctx.get('credentials')
  let value
  if (credentials === undefined || typeof credentials.resolve !== 'function') {
    value = { ok: false, code: 'no-key', message: 'credentials service is unavailable' }
  } else {
    const resolved = await credentials.resolve(provider.ref)
    if (resolved === undefined || resolved === null || resolved.value === undefined || resolved.value === '') {
      value = { ok: false, code: 'no-key', message: 'this credential is not configured' }
    } else {
      value = await fetchBalance(provider.kind, resolved.value, signal)
    }
  }

  balanceCache.set(provider.ref, {
    expiresAt: now + (value.ok ? BALANCE_OK_CACHE_MS : BALANCE_FAILURE_CACHE_MS),
    value,
  })
  return value
}

function coldUsage(ctx, snapshot) {
  const cache = ctx.get('sessionProjectionCache')
  if (cache === undefined || typeof cache.cachedSnapshot !== 'function') {
    return { all: emptyBucket(), today: emptyBucket() }
  }
  let block
  try {
    block = cache.cachedSnapshot(snapshot.header, ['tokenUsage'])
  } catch {
    return { all: emptyBucket(), today: emptyBucket() }
  }
  const view = block === undefined || block.values === undefined ? undefined : block.values.tokenUsage
  const all = bucketFromView(view)
  const at = revisionTime(snapshot.revision)
  const isToday = at !== undefined && at >= startOfLocalDay()
  return { all, today: isToday ? all : emptyBucket() }
}

let aggregateCache

async function readAggregate(ctx, signal) {
  const now = Date.now()
  const dayStart = startOfLocalDay(now)
  if (aggregateCache !== undefined && aggregateCache.expiresAt > now && aggregateCache.dayStart === dayStart) {
    return aggregateCache
  }

  const sessions = ctx.get('sessions')
  const persistence = ctx.get('sessionPersistence')
  const live = sessions !== undefined && typeof sessions.list === 'function' ? sessions.list() : []
  const liveIds = new Set(live.map((session) => session.id))

  let all = emptyBucket()
  let today = emptyBucket()
  let snapshots = []
  if (persistence !== undefined && typeof persistence.list === 'function') {
    snapshots = await persistence.list({ signal })
    for (const snapshot of snapshots) {
      const id = snapshot === null || snapshot.header === undefined ? undefined : snapshot.header.id
      if (typeof id !== 'string' || liveIds.has(id)) continue
      const cold = coldUsage(ctx, snapshot)
      all = addBucket(all, cold.all)
      today = addBucket(today, cold.today)
    }
  }
  for (const session of live) {
    const events = sessionEventsOf(session)
    all = addBucket(all, foldEvents(events))
    today = addBucket(today, foldEvents(events, dayStart))
  }

  aggregateCache = { expiresAt: now + USAGE_CACHE_MS, dayStart, all, today, snapshots }
  return aggregateCache
}

async function readCurrent(ctx, sessionId, aggregate) {
  if (typeof sessionId !== 'string' || sessionId === '') return emptyBucket()
  const sessions = ctx.get('sessions')
  if (sessions !== undefined && typeof sessions.get === 'function') {
    const session = sessions.get(sessionId)
    if (session !== undefined) return foldEvents(sessionEventsOf(session))
  }
  const snapshot = aggregate.snapshots.find((candidate) => candidate !== null
    && candidate.header !== undefined && candidate.header.id === sessionId)
  if (snapshot === undefined) return emptyBucket()
  return coldUsage(ctx, snapshot).all
}

function resolveProvider(providers, requested) {
  const list = providers.length > 0 ? providers : []
  if (list.length === 0) return undefined
  if (typeof requested === 'string' && requested !== '') {
    const byRef = list.find((provider) => provider.ref === requested)
    if (byRef !== undefined) return byRef
    const byId = list.find((provider) => provider.id === requested)
    if (byId !== undefined) return byId
  }
  return list[0]
}

async function computeSnapshot(ctx, payload, signal) {
  const requested = payload !== null && typeof payload === 'object'
    ? { provider: typeof payload.provider === 'string' ? payload.provider : undefined, sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined }
    : { provider: undefined, sessionId: undefined }

  const providers = discoverProviders()
  const provider = resolveProvider(providers, requested.provider)

  const [balance, aggregate] = await Promise.all([
    provider === undefined
      ? Promise.resolve({ ok: false, code: 'no-key', message: 'no API key was discovered' })
      : readBalance(ctx, provider, signal),
    readAggregate(ctx, signal),
  ])

  return {
    providers,
    provider: provider === undefined ? null : provider.ref,
    balance,
    usage: {
      current: await readCurrent(ctx, requested.sessionId, aggregate),
      today: aggregate.today,
      all: aggregate.all,
    },
    fetchedAt: Date.now(),
  }
}

/** Dispatch one endpoint call. */
async function handleCall(ctx, endpoint, payload, signal) {
  if (endpoint === ENDPOINT_PROVIDERS) {
    return { ok: true, value: { providers: discoverProviders(), fetchedAt: Date.now() } }
  }
  if (endpoint === ENDPOINT_SNAPSHOT) {
    return { ok: true, value: await computeSnapshot(ctx, payload, signal) }
  }
  return {
    ok: false,
    error: { code: 'gateway/bad-request', message: `usage-preview: unknown endpoint ${JSON.stringify(endpoint)}`, details: {} },
  }
}

function badRequest(message) {
  return { ok: false, error: { code: 'gateway/bad-request', message, details: {} } }
}

/** Manually serve the generic RPC envelope on a direct web-server route. */
function directRouteHandler(ctx) {
  return (request, response) => {
    const fail = (status, text) => {
      response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(text)
    }
    const pathname = String(request.url ?? '').split('?')[0]
    if (request.method !== 'POST' || !pathname.startsWith(`${CHANNEL}/`)) {
      fail(404, 'not found')
      return
    }
    const endpoint = pathname.slice(CHANNEL.length + 1)
    if (!/^[A-Za-z0-9_$.-]+$/.test(endpoint)) {
      fail(404, 'not found')
      return
    }
    let raw = ''
    request.on('data', (chunk) => { raw += chunk })
    request.on('error', () => fail(400, 'body read failed'))
    request.on('end', () => {
      let envelope
      try {
        envelope = JSON.parse(raw)
      } catch {
        fail(400, 'body is not JSON')
        return
      }
      if (envelope === null || typeof envelope !== 'object' || envelope.type !== 'client-request' || typeof envelope.rpcId !== 'string' || typeof envelope.method !== 'string') {
        fail(400, 'invalid client-request envelope')
        return
      }
      if (envelope.method !== endpoint) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: badRequest(`method ${JSON.stringify(envelope.method)} does not match endpoint ${JSON.stringify(endpoint)}`),
        }))
        return
      }
      const controller = new AbortController()
      request.on('aborted', () => controller.abort())
      handleCall(ctx, endpoint, envelope.payload, controller.signal).then((result) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId, result }))
      }, (error) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: false, error: { code: 'gateway/internal', message: String(error), details: {} } },
        }))
      })
    })
  }
}

/** Host service names this plugin uses (declared to the loader for readiness). */
export const name = 'usage-preview'
export const inject = []

/**
 * Mount the `/usage-preview` surface. Two registration paths are attempted,
 * most specific first:
 *   1. the Connection RPC channel (`ctx.connection.rpc.handle`), which shares
 *      the browser transport and its auth;
 *   2. a direct web-server prefix route speaking the same envelope, so the
 *      panel still works when the connection service is unavailable or its
 *      channel registration is refused.
 * @param {object} ctx - host Cordis context.
 */
export function apply(ctx) {
  log('apply called')
  // The loader mounts this row before the host services exist (entries
  // activate as their dependencies appear), so registration waits for the web
  // server instead of running inside apply.
  ctx.inject(['webServer'], (serviceCtx) => {
    log('webServer service available; registering route')
    for (const serviceName of ['connection', 'webServer', 'credentials', 'sessions', 'sessionPersistence', 'sessionProjectionCache']) {
      const service = serviceCtx.get(serviceName)
      log(`  service ${serviceName}: ${service === undefined ? 'absent' : typeof service}`)
    }

    let mode
    let dispose

    try {
      const connection = serviceCtx.get('connection')
      if (connection !== undefined && connection.rpc !== undefined && typeof connection.rpc.handle === 'function') {
        dispose = connection.rpc.handle(CHANNEL, async (endpoint, payload, signal) => handleCall(ctx, endpoint, payload, signal))
        mode = 'connection.rpc'
      }
    } catch (error) {
      log(`connection.rpc.handle failed: ${error && error.stack ? error.stack : String(error)}`)
    }

    if (mode === undefined) {
      try {
        const webServer = serviceCtx.get('webServer')
        if (webServer !== undefined && typeof webServer.register === 'function') {
          dispose = webServer.register({ kind: 'prefix', path: CHANNEL, handler: directRouteHandler(ctx) })
          mode = 'webServer.direct'
        }
      } catch (error) {
        log(`webServer.register failed: ${error && error.stack ? error.stack : String(error)}`)
      }
    }

    if (mode === undefined) {
      log('ERROR: no route registration path available')
      return
    }

    log(`route registered via ${mode}`)
    ctx.effect(() => dispose, 'usage-preview: rpc channel')
  })
}
