import 'server-only'
import { z } from 'zod'
import { callRpc, type RpcClient } from '../../billing/rpc'
import { compareCatalog, productQuery } from '../../billing/waffo/catalog-check'
import { readWaffoCatalog } from '../../billing/waffo/client'
import { waffoConfig, type WaffoConfig } from '../../billing/waffo/config'
import type { SiteProduct } from '../../config'
import type { MembershipProductId } from '../../waffo-env'

// Seeded revisions (1 and 2) have no publication request, so the per-product review cannot bind
// them. This reads this deployment's Waffo products (the WAFFO_*_PRODUCT_IDS mappings), compares
// each with the version's quote, and binds only the versions whose every product matches
// (ARCHITECTURE §6.3). A mismatch stays off the Waffo channel until the dashboard is fixed.

export type SeededOutcome = { sku: string; status: 'bound' | 'mismatch' | 'stale' }
type Read = (query: string, variables: Record<string, unknown>) => Promise<unknown>

async function bindOne(db: RpcClient, actor: string, config: WaffoConfig, product: SiteProduct): Promise<SeededOutcome> {
  const recurring = product.tier === 'pack' ? null : config.subscriptionProductIds[product.id as MembershipProductId]
  try {
    await callRpc(db, 'admin_catalog_waffo_seeded', { p_actor: actor, p_product: product.id, p_revision: product.revision,
      p_store: config.storeId, p_mode: config.mode, p_once: config.productIds[product.id], p_recurring: recurring }, z.null())
    return { sku: product.id, status: 'bound' }
  } catch (error) {
    // A version that has since been published through a request is reviewed there instead.
    if ((error as { cause?: { message?: unknown } }).cause?.message !== 'CATALOG_STALE') throw error
    return { sku: product.id, status: 'stale' }
  }
}

export async function bindSeededWaffo(db: RpcClient, actor: string, products: readonly SiteProduct[],
  deps: { config?: WaffoConfig; read?: Read } = {}): Promise<SeededOutcome[]> {
  const config = deps.config ?? waffoConfig()
  const seeded = products.filter(p => p.revision === 1 || p.revision === 2)
  if (!seeded.length) return []
  const response = await (deps.read ?? readWaffoCatalog)(productQuery, {
    store: config.storeId, one: Object.values(config.productIds), rec: Object.values(config.subscriptionProductIds),
  })
  const rows = compareCatalog(seeded, config, response)
  const outcomes: SeededOutcome[] = []
  for (const product of seeded) {
    const ok = rows.filter(row => row.sku === product.id).every(row => row.ok)
    outcomes.push(ok ? await bindOne(db, actor, config, product) : { sku: product.id, status: 'mismatch' })
  }
  return outcomes
}
