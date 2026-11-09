/**
 * Replicate the cordis loader's module import: Node's internal cascaded ESM
 * loader, importing the plugin specifier from the profile base URL.
 *
 *   node --expose-internals tools/import-probe.cjs
 */
'use strict'
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { homedir } = require('node:os')

async function main() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const baseUrl = pathToFileURL(join(home, 'profiles', 'desktop') + '/').href
  const internal = require('internal/modules/esm/loader')
  const loader = internal.getOrInitializeCascadedLoader()
  console.log('baseUrl:', baseUrl)
  try {
    const mod = await loader.import('@deepseek-ai/dsh-usage-preview', baseUrl, {})
    console.log('IMPORT OK ->', Object.keys(mod).join(','))
  } catch (error) {
    console.log('IMPORT FAIL ->', error && error.message)
    process.exitCode = 1
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
