window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-usage-preview',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    var NS = 'usage'

    var zh = {
      'panel.title': '用量与余额',
      'panel.collapse': '收起',
      'panel.expand': '展开',
      'panel.refresh': '刷新',
      'provider.label': '接口',
      'provider.none': '未发现 API Key',
      'balance.title': '账户余额',
      'balance.toppedUp': '充值余额',
      'balance.granted': '赠送余额',
      'balance.noKey': '未配置该 API Key',
      'balance.fetchFailed': '余额查询失败',
      'balance.parseFailed': '余额数据解析失败',
      'balance.unsupported': '该接口未提供余额查询',
      'balance.updatedAt': '更新于 {time}',
      'usage.title': 'Token 用量',
      'usage.current': '本次会话',
      'usage.today': '今日',
      'usage.all': '全部累计',
      'usage.input': '输入',
      'usage.output': '输出',
      'usage.total': '合计',
    }
    var en = {
      'panel.title': 'Usage & Balance',
      'panel.collapse': 'Collapse',
      'panel.expand': 'Expand',
      'panel.refresh': 'Refresh',
      'provider.label': 'API',
      'provider.none': 'No API key discovered',
      'balance.title': 'Account balance',
      'balance.toppedUp': 'Topped up',
      'balance.granted': 'Granted',
      'balance.noKey': 'This API key is not configured',
      'balance.fetchFailed': 'Balance fetch failed',
      'balance.parseFailed': 'Balance data could not be parsed',
      'balance.unsupported': 'This API exposes no balance endpoint',
      'balance.updatedAt': 'Updated {time}',
      'usage.title': 'Token usage',
      'usage.current': 'This session',
      'usage.today': 'Today',
      'usage.all': 'All time',
      'usage.input': 'Input',
      'usage.output': 'Output',
      'usage.total': 'Total',
    }

    var POLL_MS = 10000
    var EXPANDED_KEY = 'dsh.usage-preview.expanded'
    var SIZE_KEY = 'dsh.usage-preview.size'
    var POSITION_KEY = 'dsh.usage-preview.position'
    var PROVIDER_KEY = 'dsh.usage-preview.provider'
    var MIN_W = 200
    var MIN_H = 120
    var MAX_W = 520
    var MAX_H = 560

    var SURFACE = 'var(--dsw-alias-bg-overlay, #1f1f22)'
    var BORDER_L1 = 'var(--dsw-alias-border-l1, rgba(255,255,255,0.08))'
    var BORDER_L2 = 'var(--dsw-alias-border-l2, rgba(255,255,255,0.14))'
    var TEXT = 'var(--dsw-alias-label-primary, #e8e8ea)'
    var TEXT_2 = 'var(--dsw-alias-label-secondary, #b8b8bd)'
    var TEXT_3 = 'var(--dsw-alias-label-tertiary, #8b8b92)'
    var HOVER = 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06))'
    var SHADOW = '0 8px 28px rgba(0,0,0,0.28)'

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function loadJSON(key) {
      try {
        var raw = window.localStorage.getItem(key)
        if (raw === null) return undefined
        return JSON.parse(raw)
      } catch (error) {
        return undefined
      }
    }

    function saveJSON(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch (error) {
        // Storage unavailable (private mode / quota): the preference resets on reload.
      }
    }

    function loadExpanded() {
      var stored = loadJSON(EXPANDED_KEY)
      return stored === undefined ? true : stored !== false
    }

    function loadSize() {
      var stored = loadJSON(SIZE_KEY)
      if (stored === null || typeof stored !== 'object') return null
      if (typeof stored.width !== 'number' || typeof stored.height !== 'number') return null
      return { width: stored.width, height: stored.height }
    }

    function loadPosition() {
      var stored = loadJSON(POSITION_KEY)
      if (stored === null || typeof stored !== 'object') return null
      if (typeof stored.x !== 'number' || typeof stored.y !== 'number') return null
      return { x: stored.x, y: stored.y }
    }

    function loadProvider() {
      var stored = loadJSON(PROVIDER_KEY)
      return typeof stored === 'string' && stored !== '' ? stored : undefined
    }

    function formatTokens(count) {
      if (count >= 1000000) return (count / 1000000).toFixed(count >= 10000000 ? 0 : 1) + 'M'
      if (count >= 1000) return (count / 1000).toFixed(count >= 100000 ? 0 : 1) + 'k'
      return String(count)
    }

    function formatMoney(count) {
      try {
        return count.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      } catch (error) {
        return count.toFixed(2)
      }
    }

    /** Most recently updated non-blank session: the active conversation's best server-visible stand-in. */
    function selectSession(state) {
      if (state === null || typeof state !== 'object') return undefined
      var ids = Array.isArray(state.ids) ? state.ids : []
      var byId = state.byId !== null && typeof state.byId === 'object' ? state.byId : {}
      var best
      var bestAt = -1
      for (var index = 0; index < ids.length; index += 1) {
        var id = ids[index]
        var entry = byId[id]
        if (entry === null || typeof entry !== 'object' || entry.blank === true) continue
        var at = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0
        if (at > bestAt) {
          bestAt = at
          best = id
        }
      }
      return best
    }

    function UsageRow(props) {
      return h('tr', null,
        h('td', { style: { textAlign: 'left', whiteSpace: 'nowrap', color: TEXT } }, props.label),
        h('td', { style: { textAlign: 'right', color: TEXT_2 } }, formatTokens(props.bucket.inputTokens)),
        h('td', { style: { textAlign: 'right', color: TEXT_2 } }, formatTokens(props.bucket.outputTokens)),
        h('td', { style: { textAlign: 'right', fontWeight: 600, color: TEXT } }, formatTokens(props.bucket.totalTokens)))
    }

    function BalanceSection(props) {
      var t = props.t
      var children = []
      children.push(h('div', { key: 'title', style: { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: TEXT_2 } },
        t('balance.title') + (props.providerLabel !== undefined ? ' · ' + props.providerLabel : '')))
      var balance = props.balance
      if (balance === null || typeof balance !== 'object' || balance.ok !== true) {
        var code = balance !== null && typeof balance === 'object' ? balance.code : undefined
        var message = code === 'no-key'
          ? t('balance.noKey')
          : code === 'parse-failed'
            ? t('balance.parseFailed')
            : code === 'unsupported'
              ? t('balance.unsupported')
              : t('balance.fetchFailed')
        children.push(h('div', { key: 'error', style: { color: TEXT_3 } }, message))
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, children)
      }
      var view = balance.balance
      children.push(h('div', { key: 'total', style: { fontSize: 16, fontWeight: 700, lineHeight: '22px' } }, view.currency + ' ' + formatMoney(view.total)))
      children.push(h('div', { key: 'topped', style: { display: 'flex', justifyContent: 'space-between', color: TEXT_2 } },
        h('span', null, t('balance.toppedUp')),
        h('span', null, formatMoney(view.toppedUp))))
      children.push(h('div', { key: 'granted', style: { display: 'flex', justifyContent: 'space-between', color: TEXT_2 } },
        h('span', null, t('balance.granted')),
        h('span', null, formatMoney(view.granted))))
      children.push(h('div', { key: 'updated', style: { fontSize: 11, color: TEXT_3 } },
        t('balance.updatedAt', { time: new Date(props.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false }) })))
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } }, children)
    }

    function UsageSection(props) {
      var t = props.t
      var usage = props.usage
      var head = h('thead', null, h('tr', null,
        h('th', { style: { padding: '2px 4px' } }),
        h('th', { scope: 'col', style: { padding: '2px 4px', fontSize: 11, fontWeight: 500, textAlign: 'right', color: TEXT_3 } }, t('usage.input')),
        h('th', { scope: 'col', style: { padding: '2px 4px', fontSize: 11, fontWeight: 500, textAlign: 'right', color: TEXT_3 } }, t('usage.output')),
        h('th', { scope: 'col', style: { padding: '2px 4px', fontSize: 11, fontWeight: 500, textAlign: 'right', color: TEXT_3 } }, t('usage.total'))))
      var body = h('tbody', null,
        h(UsageRow, { label: t('usage.current'), bucket: usage.current }),
        h(UsageRow, { label: t('usage.today'), bucket: usage.today }),
        h(UsageRow, { label: t('usage.all'), bucket: usage.all }))
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        h('div', { style: { margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: TEXT_2 } }, t('usage.title')),
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' } }, head, body))
    }

    function UsagePreview(props) {
      var t = typeof props.t === 'function' ? props.t : function (key) { return key }
      var useSessions = typeof props.useSessions === 'function' ? props.useSessions : null
      var fetchSnapshot = props.fetchSnapshot
      var sessionId = useSessions !== null ? useSessions(selectSession) : undefined

      var expandedState = React.useState(loadExpanded)
      var expanded = expandedState[0]
      var sizeState = React.useState(loadSize)
      var size = sizeState[0]
      var posState = React.useState(loadPosition)
      var position = posState[0]
      var providerState = React.useState(loadProvider)
      var selected = providerState[0]
      var snapState = React.useState(null)
      var snapshot = snapState[0]
      var setSnapshot = snapState[1]
      var errState = React.useState(null)
      var error = errState[0]
      var refreshingState = React.useState(false)
      var refreshing = refreshingState[0]
      var setRefreshing = refreshingState[1]
      var seqRef = React.useRef(0)
      var livePos = React.useRef(position)
      var liveSize = React.useRef(size)
      var dragRef = React.useRef(null)
      var resizeRef = React.useRef(null)

      var refresh = React.useCallback(function () {
        var seq = seqRef.current + 1
        seqRef.current = seq
        setRefreshing(true)
        Promise.resolve()
          .then(function () { return fetchSnapshot(selected, sessionId) })
          .then(function (result) {
            if (seqRef.current !== seq) return
            if (result !== null && typeof result === 'object' && result.ok === true) {
              setSnapshot(result.value)
              errState[1](null)
            } else {
              var failure = result !== null && typeof result === 'object' && result.error !== undefined ? result.error : undefined
              errState[1](failure !== undefined ? String(failure.code) + ': ' + String(failure.message) : 'usage-preview request failed')
            }
          })
          .catch(function (cause) {
            if (seqRef.current === seq) errState[1](String(cause))
          })
          .finally(function () {
            if (seqRef.current === seq) setRefreshing(false)
          })
      }, [selected, sessionId, fetchSnapshot])

      React.useEffect(function () {
        refresh()
      }, [refresh])
      React.useEffect(function () {
        var timer = window.setInterval(refresh, POLL_MS)
        return function () { window.clearInterval(timer) }
      }, [refresh])

      var chooseProvider = function (ref) {
        providerState[1](ref)
        saveJSON(PROVIDER_KEY, ref)
      }

      var toggleExpanded = function (next) {
        expandedState[1](next)
        saveJSON(EXPANDED_KEY, next)
      }

      var onHeaderDown = function (event) {
        var target = event.target
        if (target !== null && target.closest !== undefined && target.closest('button') !== null) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        var rect = event.currentTarget.getBoundingClientRect()
        dragRef.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
      }
      var onHeaderMove = function (event) {
        var handle = dragRef.current
        if (handle === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        var next = {
          x: clamp(handle.left + event.clientX - handle.x, 0, Math.max(0, window.innerWidth - 180)),
          y: clamp(handle.top + event.clientY - handle.y, 0, Math.max(0, window.innerHeight - 80)),
        }
        livePos.current = next
        posState[1](next)
      }
      var onHeaderUp = function (event) {
        if (dragRef.current === null) return
        dragRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (livePos.current !== null) saveJSON(POSITION_KEY, livePos.current)
      }

      var onResizeDown = function (event) {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        var panel = event.currentTarget.parentElement
        var rect = panel !== null ? panel.getBoundingClientRect() : { width: 248, height: 200 }
        resizeRef.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }
      }
      var onResizeMove = function (event) {
        var handle = resizeRef.current
        if (handle === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return
        var next = {
          width: clamp(handle.width + event.clientX - handle.x, MIN_W, MAX_W),
          height: clamp(handle.height + event.clientY - handle.y, MIN_H, MAX_H),
        }
        liveSize.current = next
        sizeState[1](next)
      }
      var onResizeUp = function (event) {
        if (resizeRef.current === null) return
        resizeRef.current = null
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (liveSize.current !== null) saveJSON(SIZE_KEY, liveSize.current)
      }

      var panelStyle = {
        position: 'fixed',
        zIndex: 30,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        width: size !== null ? size.width : 248,
        overflow: 'hidden',
        border: '1px solid ' + BORDER_L2,
        borderRadius: 12,
        background: SURFACE,
        boxShadow: SHADOW,
        color: TEXT,
        fontSize: 12,
        lineHeight: '18px',
        pointerEvents: 'auto',
      }
      if (position !== null) {
        panelStyle.left = position.x
        panelStyle.top = position.y
      } else {
        panelStyle.right = 16
        panelStyle.bottom = 16
      }
      if (size !== null) panelStyle.height = size.height

      var providers = snapshot !== null && Array.isArray(snapshot.providers) ? snapshot.providers : []
      var selectedProvider = null
      for (var providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
        if (providers[providerIndex].ref === selected) {
          selectedProvider = providers[providerIndex]
          break
        }
      }
      if (selectedProvider === null && providers.length > 0) selectedProvider = providers[0]
      var totalTokens = snapshot !== null && snapshot.usage !== undefined ? snapshot.usage.all.totalTokens : undefined
      var balance = snapshot !== null ? snapshot.balance : undefined
      var pillParts = []
      if (balance !== undefined && balance !== null && balance.ok === true) pillParts.push(balance.balance.currency + ' ' + formatMoney(balance.balance.total))
      if (totalTokens !== undefined) pillParts.push(formatTokens(totalTokens))
      var pillLabel = pillParts.length > 0 ? pillParts.join(' · ') : t('panel.title')

      if (!expanded) {
        return h('div', { style: panelStyle, role: 'region', 'aria-label': t('panel.title') },
          h('button', {
            type: 'button',
            onClick: function () { toggleExpanded(true) },
            title: t('panel.expand'),
            'aria-label': t('panel.expand'),
            style: {
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              border: 0,
              background: 'transparent',
              color: TEXT_2,
              fontSize: 12,
              lineHeight: '18px',
              textAlign: 'left',
              cursor: 'pointer',
            },
          }, pillLabel))
      }

      var bodyStyle = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 8,
        overflow: 'auto',
        minHeight: 0,
        maxHeight: size !== null ? 'none' : 280,
      }

      var providerOptions = providers.length > 0
        ? providers.map(function (provider) {
          return h('option', { key: provider.ref, value: provider.ref }, provider.label)
        })
        : [h('option', { key: 'none', value: '', disabled: true }, t('provider.none'))]

      var children = []
      children.push(h('div', {
        key: 'header',
        onPointerDown: onHeaderDown,
        onPointerMove: onHeaderMove,
        onPointerUp: onHeaderUp,
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          cursor: 'grab',
          userSelect: 'none',
          borderBottom: '1px solid ' + BORDER_L1,
          touchAction: 'none',
        },
      },
      h('span', { style: { fontWeight: 600, fontSize: 12 } }, t('panel.title')),
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 2 } },
        h('button', {
          type: 'button',
          onClick: function () { refresh() },
          disabled: refreshing,
          'aria-label': t('panel.refresh'),
          title: t('panel.refresh'),
          style: { width: 22, height: 22, padding: 0, border: 0, borderRadius: 6, background: 'transparent', color: TEXT_2, fontSize: 12, lineHeight: 1, cursor: 'pointer', opacity: refreshing ? 0.5 : 1 },
        }, '⟳'),
        h('button', {
          type: 'button',
          onClick: function () { toggleExpanded(false) },
          'aria-label': t('panel.collapse'),
          title: t('panel.collapse'),
          style: { width: 22, height: 22, padding: 0, border: 0, borderRadius: 6, background: 'transparent', color: TEXT_2, fontSize: 12, lineHeight: 1, cursor: 'pointer' },
        }, '–'))))

      var bodyChildren = []
      if (error !== null) {
        bodyChildren.push(h('div', { key: 'error', style: { padding: '6px 8px', borderRadius: 8, background: HOVER, color: TEXT_2, overflowWrap: 'anywhere' } }, error))
      }
      bodyChildren.push(h('div', { key: 'provider', style: { display: 'flex', alignItems: 'center', gap: 6 } },
        h('span', { style: { color: TEXT_3, whiteSpace: 'nowrap' } }, t('provider.label')),
        h('select', {
          value: selectedProvider !== null ? selectedProvider.ref : '',
          onChange: function (event) { chooseProvider(event.target.value) },
          style: {
            flex: 1,
            minWidth: 0,
            padding: '2px 4px',
            borderRadius: 6,
            border: '1px solid ' + BORDER_L2,
            background: HOVER,
            color: TEXT,
            fontSize: 12,
            cursor: 'pointer',
          },
        }, providerOptions)))
      if (snapshot !== null) {
        bodyChildren.push(h(BalanceSection, { key: 'balance', balance: snapshot.balance, fetchedAt: snapshot.fetchedAt, t: t, providerLabel: selectedProvider !== null ? selectedProvider.label : undefined }))
        bodyChildren.push(h(UsageSection, { key: 'usage', usage: snapshot.usage, t: t }))
      }
      if (snapshot === null && error === null) {
        bodyChildren.push(h('div', { key: 'loading', style: { color: TEXT_3 } }, t('panel.refresh') + '…'))
      }
      children.push(h('div', { key: 'body', style: bodyStyle }, bodyChildren))
      children.push(h('div', {
        key: 'resize',
        onPointerDown: onResizeDown,
        onPointerMove: onResizeMove,
        onPointerUp: onResizeUp,
        'aria-hidden': true,
        style: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, cursor: 'nwse-resize', touchAction: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' },
      },
      h('div', { style: { width: 8, height: 8, marginRight: 3, marginBottom: 3, borderRight: '2px solid ' + TEXT_3, borderBottom: '2px solid ' + TEXT_3, borderBottomRightRadius: 3, opacity: 0.7 } })))

      return h('div', { style: panelStyle, role: 'region', 'aria-label': t('panel.title') }, children)
    }

    /** Required services for the overlay entry, locale registration, and the RPC caller. */
    var inject = ['slots', 'locale', 'connection']

    /**
     * Client plugin body: register dictionaries and contribute the floating
     * panel to the shell overlay. The panel reaches the host through the
     * injected `fetchSnapshot` face.
     */
    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en })
      }, 'ui-usage-preview: dictionaries')
      ctx.slots.inject('shell.overlay', function () {
        return ctx.slots.register({
          name: 'shell.overlay',
          id: 'usage-preview',
          order: 100,
          locale: NS,
          inject: function () {
            return {
              fetchSnapshot: function (provider, sessionId) {
                var connection = ctx.get('connection')
                if (connection === undefined || connection.rpc === undefined || typeof connection.rpc.call !== 'function') {
                  return Promise.reject(new Error('usage-preview: connection.rpc.call is unavailable'))
                }
                var payload = {}
                if (provider !== undefined && provider !== '') payload.provider = provider
                if (sessionId !== undefined) payload.sessionId = sessionId
                return connection.rpc.call('/usage-preview', 'snapshot', payload)
              },
            }
          },
        }, UsagePreview)
      })
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
