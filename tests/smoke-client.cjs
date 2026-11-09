/**
 * Keyless smoke test for the usage-preview browser bundle: executes the
 * __ModuleLoader__ entry with a fake React, applies the plugin to a fake
 * client context, and renders the panel once (with the provider selector).
 *
 *   node tests/smoke-client.cjs
 */
'use strict'
const vm = require('node:vm')
const fs = require('node:fs')
const path = require('node:path')

const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')

const registered = []
const fakeReact = {
  __stateCalls: 0,
  createElement: function (type, props) {
    const children = Array.prototype.slice.call(arguments, 2)
    return { type: type, props: props || {}, children: children }
  },
  useState: function (init) {
    // The 5th hook call is the snapshot state; seed the render with a value.
    const call = fakeReact.__stateCalls++
    if (call === 4) return [globalThis.__SMOKE_SNAPSHOT, function () {}]
    const value = typeof init === 'function' ? init() : init
    return [value, function () {}]
  },
  useRef: function (v) { return { current: v } },
  useEffect: function () {},
  useCallback: function (fn) { return fn },
}

const fakeWindow = {
  __ModuleLoader__: { load: function (entry) { registered.push(entry) } },
  localStorage: { getItem: function () { return null }, setItem: function () {} },
  setInterval: function () { return 0 },
  clearInterval: function () {},
  innerWidth: 1000,
  innerHeight: 800,
}

const sandbox = {
  window: fakeWindow,
  console: console,
  Promise: Promise,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Math: Math,
  Date: Date,
  JSON: JSON,
  Error: Error,
}

vm.createContext(sandbox)
vm.runInContext(code, sandbox)

if (registered.length !== 1) throw new Error('expected one registered entry, got ' + registered.length)
const entry = registered[0]
if (entry.id !== '@deepseek-ai/dsh-usage-preview') throw new Error('bad id: ' + entry.id)

function fakeRequire(id) {
  if (id === 'react' || id === 'react/jsx-runtime' || id === 'react-dom') return fakeReact
  throw new Error('unexpected require: ' + id)
}

const plugin = entry.factory(fakeRequire)
const inject = plugin.inject
if (!Array.isArray(inject) || inject.indexOf('slots') === -1 || inject.indexOf('connection') === -1 || inject.indexOf('locale') === -1) {
  throw new Error('bad inject list: ' + JSON.stringify(inject))
}

globalThis.__SMOKE_SNAPSHOT = {
  providers: [
    { id: 'deepseek', ref: 'DEEPSEEK_API_KEY', label: 'DeepSeek', kind: 'deepseek' },
    { id: 'kimi-coding', ref: 'KIMI_CODING_API_KEY', label: 'Kimi Coding', kind: 'moonshot' },
  ],
  provider: 'DEEPSEEK_API_KEY',
  balance: { ok: true, balance: { currency: 'CNY', total: 6.83, granted: 0, toppedUp: 6.83, isAvailable: true } },
  usage: {
    current: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    today: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    all: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
  },
  fetchedAt: Date.now(),
}

let registeredSlot = null
const ctx = {
  effect: function (fn) { const d = fn(); return function () {} },
  locale: { register: function () { return function () {} } },
  slots: {
    inject: function (name, setup) { setup() },
    register: function (options, component) { registeredSlot = { options: options, component: component }; return function () {} },
  },
  get: function (name) {
    if (name === 'connection') {
      return { rpc: { call: function () { return Promise.resolve({ ok: true, value: globalThis.__SMOKE_SNAPSHOT }) } } }
    }
    return undefined
  },
}

plugin.apply(ctx)

if (registeredSlot === null) throw new Error('shell.overlay register was not called')
if (registeredSlot.options.name !== 'shell.overlay' || registeredSlot.options.id !== 'usage-preview') throw new Error('bad slot options')
const face = registeredSlot.options.inject()
if (typeof face.fetchSnapshot !== 'function') throw new Error('inject face missing fetchSnapshot')

fakeReact.__stateCalls = 0
const component = registeredSlot.component
const element = component({
  t: function (key) { return key },
  useSessions: function (selector) { return selector({ ids: [], byId: {} }) },
  fetchSnapshot: face.fetchSnapshot,
})
if (element === null || element === undefined) throw new Error('component rendered nothing')

const findSelect = (node, found) => {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) findSelect(child, found)
    return found
  }
  if (node.type === 'select') found.push(node)
  if (Array.isArray(node.children)) findSelect(node.children, found)
  return found
}
const selects = findSelect(element, [])
if (selects.length !== 1) throw new Error('expected one provider select, got ' + selects.length)
const rawOptions = selects[0].children
const flatOptions = []
for (const item of rawOptions) {
  if (Array.isArray(item)) flatOptions.push(...item)
  else if (item !== undefined && item !== null) flatOptions.push(item)
}
if (flatOptions.length !== 2) throw new Error('expected two provider options, got ' + flatOptions.length)
if (flatOptions[0].props.value !== 'DEEPSEEK_API_KEY') throw new Error('bad first option: ' + JSON.stringify(flatOptions[0].props))

console.log('OK: entry id', entry.id)
console.log('OK: inject', JSON.stringify(inject))
console.log('OK: slot', registeredSlot.options.name, '/', registeredSlot.options.id, 'order', registeredSlot.options.order)
console.log('OK: provider select options', flatOptions.map((o) => o.props.value).join(', '))
console.log('OK: component rendered root type', typeof element.type === 'string' ? element.type : 'component')
