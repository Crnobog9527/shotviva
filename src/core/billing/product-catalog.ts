import 'server-only'

import { z } from 'zod'

import { MEMBERSHIP_TIERS, PRODUCT_IDS, type SiteProduct } from '../config'
import { AppError } from '../errors'
import type { PricingVersion } from './checkout-price'
import { callRpc, type RpcClient } from './rpc'

const base = z.object({
  product_id: z.enum(PRODUCT_IDS), revision: z.int().positive(), usd_cents: z.int().positive(),
  credits: z.int().positive(), listed: z.boolean(), name_en: z.string(), name_zh: z.string(),
})

const row = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('pack'), tier: z.literal('pack'), paid_days: z.null() }),
  base.extend({ kind: z.literal('monthly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(30) }),
  base.extend({ kind: z.literal('yearly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(365) }),
])

// Phase one has exactly the nine existing identities in either denomination.
const catalog = z.array(row).length(PRODUCT_IDS.length)
  .refine(rows => new Set(rows.map(r => r.product_id)).size === PRODUCT_IDS.length)

export function readProductCatalog(db: RpcClient, version: PricingVersion) {
  return callRpc(db, 'read_product_catalog', { p_version: version ?? 'v1' }, catalog)
}

// Only stable error codes go into the shared alert key and the Feishu group, never error messages.
export function catalogReadErrorCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause ?? error : error
  if (cause instanceof z.ZodError) return 'INVALID_CATALOG'
  if (cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
    && /^[A-Z0-9_]{1,32}$/.test(cause.code)) return cause.code
  return error instanceof AppError ? error.code : 'INTERNAL'
}

export function listedProducts(rows: z.infer<typeof catalog>): SiteProduct[] {
  return rows.filter(r => r.listed).map(r => {
    const common = { id: r.product_id, credits: r.credits, priceUsd: r.usd_cents / 100 }
    if (r.kind === 'pack') return { ...common, tier: r.tier, interval: null, paidDays: null }
    return { ...common, tier: r.tier, interval: r.kind === 'monthly' ? 'month' : 'year', paidDays: r.paid_days }
  })
}
