// Compares this environment's Waffo products with the current catalog quote, read-only, in test
// or prod mode (ARCHITECTURE §6.3). Waffo renews at its dashboard price, so a drift here becomes
// a frozen renewal a period later. `pnpm pricing:waffo:prod` runs it with the pulled production
// env. Prints product ids by their last four characters only; never keys or the store id.
import { createAdminSupabase } from '../src/core/auth/supabase-admin'
import { catalogReadErrorCode, publishedOffers, waffoOffers } from '../src/core/billing/product-catalog'
import { bindingRows, catalogCheckMode, catalogReport, checkedMaps, compareCatalog, productQuery } from '../src/core/billing/waffo/catalog-check'
import { callRpc, type RpcClient } from '../src/core/billing/rpc'
import { readWaffoCatalog } from '../src/core/billing/waffo/client'
import { waffoConfig } from '../src/core/billing/waffo/config'
import { serverEnv } from '../src/core/env'
import { site } from '../src/site/site.config'

// A preview build can precede migration 1567 on its database; nothing is bound before it.
async function readBindings(db: RpcClient, store: string, mode: string) {
  try {
    return await callRpc(db, 'read_waffo_bindings', { p_store: store, p_mode: mode }, bindingRows)
  } catch (error) {
    if (catalogReadErrorCode(error) !== 'PGRST202') throw error
    return []
  }
}

async function main() {
  const env = serverEnv()
  if (catalogCheckMode(process.argv, env) === 'skip') return
  const config = waffoConfig()
  // The database holds the current quote; without it (a bare checkout) the site baseline stands in.
  const db = env.SUPABASE_SERVICE_ROLE_KEY ? createAdminSupabase() : null
  const version = site.billing.pricingVersion
  const products = db ? await publishedOffers(db, version) : site.billing.products
  const shown = db ? new Set((await waffoOffers(db, version, config.storeId, config.mode)).map(p => p.id)) : undefined
  const bindings = db ? await readBindings(db, config.storeId, config.mode) : []
  const { maps, unmapped, mapped } = checkedMaps(products, config, bindings)
  const ids = (record: Partial<Record<string, string>>) => [...new Set(Object.values(record).filter(Boolean))]
  const response = await readWaffoCatalog(productQuery, { store: config.storeId, one: ids(maps.productIds), rec: ids(maps.subscriptionProductIds) })
  const rows = compareCatalog(mapped, maps, response)
  process.stdout.write(`Waffo ${config.mode} mode, quote from ${db ? 'database catalog' : 'site baseline'} (${version ?? 'v1'}), read-only\n`)
  for (const line of catalogReport(rows, shown)) process.stdout.write(`${line}\n`)
  for (const sku of unmapped) process.stdout.write(`${sku} unmapped: no Waffo binding, hidden on the Waffo channel\n`)
  const issues = rows.filter(row => !row.ok)
  if (issues.length) throw new Error(`Waffo ${config.mode} catalog needs review: ${[...new Set(issues.map(row => row.sku))].join(', ')}`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Waffo catalog check failed'}\n`)
  process.exitCode = 1
})
