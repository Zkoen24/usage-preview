# Floating usage preview for DeepSeek Harness

A draggable, resizable, collapsible panel in the web GUI's shell overlay that
shows, at a glance:

- **Account balance** for each discovered API key, switchable from a selector
  (DeepSeek official, Kimi Coding, and any future `*_API_KEY` you add);
- **Token usage** in three windows — the current session, today, and all time —
  folded from the session event logs plus the persisted projection cache.

![panel](docs/panel.gif) <!-- optional: drop a screenshot/GIF here -->

## Layout

```
lib/index.js        host half: /usage-preview RPC surface (self-contained, no @deepseek-ai imports)
lib/client.js       browser bundle: the shell.overlay panel (plain loader-factory)
src/client/index.js source of the browser bundle
tests/              keyless smoke tests (node only)
tools/              diagnostics against a running desktop app
```

## Why it is self-contained

The packaged desktop runtime resolves plugin dependencies through its own
two-anchor resolution. This plugin therefore imports **nothing** from
`@deepseek-ai/*` at runtime: every capability arrives through the Cordis
context (`ctx.get(...)`), and the browser bundle requires only `react`. That
keeps it working across desktop releases.

## Install (desktop app)

1. Copy this package to
   `%DSH_HOME%\profiles\<profile>\node_modules\@deepseek-ai\dsh-usage-preview`.
2. Add the row to `%DSH_HOME%\profiles\<profile>\cordis.patch.yml`:

```yaml
- insert:
    - id: usage-preview
      name: '@deepseek-ai/dsh-usage-preview'
```

3. Restart the app. The panel appears in the bottom-right corner.

The host half registers its route lazily: `apply` waits for the `webServer`
service (`ctx.inject(['webServer'], …)`) because the loader mounts the row
before the host services exist. It first tries the Connection RPC channel and
falls back to a direct web-server prefix route speaking the same envelope.

## Tests

```sh
node tests/smoke-host.mjs     # folds usage, parses both balance adapters, checks the endpoint dispatch
node tests/smoke-client.cjs   # executes the loader factory with a fake React and renders the panel
```

Both are keyless and touch no network.

## Diagnostics (`tools/`)

Run against a **running** desktop app; they read `$DSH_HOME/usage-preview-debug.log`
and the app's authenticated API (the browser-session cookie is minted from the
local credential record — local-only, read-only):

| script | what it does |
|---|---|
| `check-resolve.mjs` | verifies the profile can resolve the plugin package |
| `check-patch.mjs` | validates the profile's `cordis.patch.yml` |
| `diag-inventory.mjs <port>` | lists plugin entries and their fiber state |
| `diag-enable.mjs <port>` | enables the entry through the plugin manager |
| `diag-boot.mjs <port>` | reads the browser boot graph and looks for the entry |
| `import-probe.cjs` | replicates the loader's internal import from the profile base |
