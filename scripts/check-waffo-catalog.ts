// A build checks the catalog only when routing test checkouts to Waffo. Operators can also
// run the same read-only comparison before routing any checkouts there.
import { serverEnv } from '../src/core/env'
import { compareCatalog, productQuery } from '../src/core/billing/waffo/catalog-check'
import { readWaffoCatalog } from '../src/core/billing/waffo/client'
import { waffoConfig } from '../src/core/billing/waffo/config'
import { site } from '../src/site/site.config'

async function main() {
  const env = serverEnv()
  if (process.argv.includes('--build') && (env.PAYMENT_CHANNEL !== 'waffo' || env.WAFFO_ENVIRONMENT !== 'test')) return
  if (env.WAFFO_ENVIRONMENT !== 'test') throw new Error('Waffo catalog check requires test mode')
  const config = waffoConfig()
  const response = await readWaffoCatalog(productQuery, {
    store: config.storeId, one: Object.values(config.productIds), rec: Object.values(config.subscriptionProductIds),
  })
  const rows = compareCatalog(site.billing.products, config, response)
  for (const row of rows) {
    process.stdout.write(`${row.sku} ${row.form} …${row.suffix} USD cents: Waffo=${row.actual ?? 'missing'} quote=${row.expected} ${row.ok ? 'OK' : 'CHECK'}\n`)
  }
  if (rows.some(row => !row.ok)) throw new Error('Waffo test catalog needs review')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Waffo catalog check failed'}\n`)
  process.exitCode = 1
})
