/**
 * Keyless smoke test for the usage-preview host half: mounts the plugin on a
 * fake Cordis context, drives both endpoints, and checks provider discovery,
 * both balance adapters, and usage aggregation.
 *
 *   node tests/smoke-host.mjs
 */
import { pathToFileURL } from 'node:url'

const moduleUrl = new URL('../lib/index.js', import.meta.url).href
const plugin = await import(moduleUrl)

const handlerBox = {}
const fakeCtx = {
  effect: function (fn) { const d = fn(); return function () {} },
  inject: function (deps, cb) { cb(fakeCtx) },
  get: function (name) {
    if (name === 'connection') {
      return {
        rpc: {
          handle: function (channel, handler) {
            handlerBox.channel = channel
            handlerBox.handler = handler
            return function () {}
          },
        },
      }
    }
    if (name === 'credentials') {
      return {
        resolve: function (ref) {
          if (ref === 'DEEPSEEK_API_KEY') return Promise.resolve({ value: 'sk-test', source: 'test' })
          if (ref === 'KIMI_CODING_API_KEY') return Promise.resolve({ value: 'sk-kimi', source: 'test' })
          return Promise.resolve(undefined)
        },
      }
    }
    if (name === 'sessions') {
      return {
        list: function () {
          const now = Date.now()
          return [
            {
              id: 'live-1',
              events: [
                { type: 'assistant/message', time: now - 1000, data: { usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 } } },
                { type: 'assistant/message', time: now - 90_000_000, data: { usage: { inputTokens: 7, outputTokens: 3 } } },
              ],
            },
          ]
        },
        get: function (id) {
          if (id !== 'live-1') return undefined
          return this.list()[0]
        },
      }
    }
    if (name === 'sessionPersistence') {
      return {
        list: function () {
          return Promise.resolve([
            { header: { id: 'live-1' }, revision: '0:0:0:' + String((Date.now() - 1000) * 1e6) + ':0' },
            { header: { id: 'cold-1' }, revision: '0:0:0:' + String(Date.now() * 1e6) + ':0' },
          ])
        },
      }
    }
    if (name === 'sessionProjectionCache') {
      return {
        cachedSnapshot: function (header, keys) {
          if (header.id !== 'cold-1' || keys[0] !== 'tokenUsage') return undefined
          return { asOfSeq: 5, values: { tokenUsage: { uncachedInputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 0 } } }
        },
      }
    }
    return undefined
  },
}

plugin.apply(fakeCtx)
if (handlerBox.channel !== '/usage-preview') throw new Error('bad channel: ' + handlerBox.channel)

const assert = (condition, message) => { if (!condition) throw new Error(message) }

// Balance fetch stub: deepseek + moonshot endpoints.
globalThis.fetch = async function (url, options) {
  const auth = options && options.headers && options.headers.authorization
  if (String(url) === 'https://api.deepseek.com/user/balance') {
    if (auth !== 'Bearer sk-test') throw new Error('bad deepseek auth: ' + String(auth))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '1.00', topped_up_balance: '11.34' }],
      }),
    }
  }
  if (String(url) === 'https://api.moonshot.cn/v1/users/me/balance') {
    if (auth !== 'Bearer sk-kimi') throw new Error('bad moonshot auth: ' + String(auth))
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { available_balance: 20.5, voucher_balance: 0.5, cash_balance: 20 } }),
    }
  }
  throw new Error('unexpected fetch ' + url)
}

const signal = new AbortController().signal

const providers = await handlerBox.handler('providers', {}, signal, {})
assert(providers.ok === true, 'providers endpoint failed')
const list = providers.value.providers
assert(Array.isArray(list) && list.length >= 2, 'expected the two fixture providers, got ' + JSON.stringify(list))
const refs = list.map((p) => p.ref)
assert(refs.includes('DEEPSEEK_API_KEY') && refs.includes('KIMI_CODING_API_KEY'), 'provider refs: ' + JSON.stringify(refs))

// Default snapshot (first provider = DeepSeek).
const snapshot = await handlerBox.handler('snapshot', { sessionId: 'live-1' }, signal, {})
assert(snapshot.ok === true, 'snapshot failed: ' + JSON.stringify(snapshot.error))
const value = snapshot.value
assert(value.providers.length === list.length, 'snapshot provider list')
assert(value.provider === 'DEEPSEEK_API_KEY', 'default provider should be DeepSeek, got ' + String(value.provider))
assert(value.balance.ok === true && value.balance.balance.total === 12.34, 'deepseek balance: ' + JSON.stringify(value.balance))
assert(value.usage.current.inputTokens === 157 && value.usage.current.outputTokens === 13, 'current: ' + JSON.stringify(value.usage.current))
assert(value.usage.all.inputTokens === 1457 && value.usage.all.outputTokens === 213, 'all: ' + JSON.stringify(value.usage.all))
assert(value.usage.today.totalTokens === 1660, 'today: ' + JSON.stringify(value.usage.today))

// Explicit provider selection (Kimi).
const kimi = await handlerBox.handler('snapshot', { provider: 'KIMI_CODING_API_KEY' }, signal, {})
assert(kimi.ok === true, 'kimi snapshot failed')
assert(kimi.value.provider === 'KIMI_CODING_API_KEY', 'selected provider')
assert(kimi.value.balance.ok === true && kimi.value.balance.balance.total === 20.5, 'kimi balance: ' + JSON.stringify(kimi.value.balance))

console.log('OK: channel', handlerBox.channel)
console.log('OK: providers', JSON.stringify(refs))
console.log('OK: default balance', JSON.stringify(value.balance))
console.log('OK: kimi balance', JSON.stringify(kimi.value.balance))
console.log('OK: usage', JSON.stringify(value.usage))
