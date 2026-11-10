import { z } from 'zod'
import { MEMBERSHIP_TIERS, productIdSchema, type SiteProduct } from '../../config'
import { desiredPrices } from '../../billing/stripe/catalog'

export const terms = z.object({
  revision: z.int().positive(), usd_cents: z.int().positive(), credits: z.int().positive(),
  listed: z.boolean(), sort_order: z.int(), name_en: z.string(), name_zh: z.string(),
  benefit_en: z.string(), benefit_zh: z.string(),
})
const status = z.enum(['draft', 'superseded', 'prepared', 'published'])
const historyRow = z.object({
  id: z.uuid(), revision: z.int(), base_revision: z.int().nullable(), status, reason: z.string(),
  actor_id: z.uuid(), last_error: z.string().nullable(), created_at: z.string(),
})
const tier = z.enum([...MEMBERSHIP_TIERS, 'pack'])
const kind = z.enum(['monthly', 'yearly', 'pack'])
export const editor = z.object({
  product_id: productIdSchema, tier, kind, current: terms.nullable(), draft: terms.nullable(),
  request: historyRow.extend({ stripe_account: z.string().nullable(), livemode: z.boolean().nullable() }).nullable(),
  waffo: z.object({ one_time_id: z.string(), recurring_id: z.string().nullable() }).nullable(),
  budget: z.number().positive().nullable(), fees: z.object({ payment_bp: z.int(), refund_bp: z.int(), commission_bp: z.int() }).nullable(), discounts: z.array(z.object({ code: z.string(), percent: z.int().min(1).max(90) })),
  bindings: z.record(z.string(), z.string()), history: z.array(historyRow),
})
export const pageRows = z.array(z.object({
  product_id: productIdSchema, name_zh: z.string().nullable(), name_en: z.string().nullable(),
  published_revision: z.int().nullable(), usd_cents: z.int().nullable(), credits: z.int().nullable(),
  listed: z.boolean().nullable(), pending: status.nullable(), tier, kind,
}))
export type Editor = z.infer<typeof editor>
export type Terms = z.infer<typeof terms>
export type CatalogPageRows = z.infer<typeof pageRows>
export const priceId = z.string().regex(/^price_[A-Za-z0-9]+$/)
export const accountId = z.string().regex(/^acct_[A-Za-z0-9]+$/)
export const waffoId = z.string().regex(/^PROD_[A-Za-z0-9]+$/)

export function asProduct(item: Editor, value: Terms): SiteProduct {
  const common = { id: item.product_id, credits: value.credits, priceUsd: value.usd_cents / 100 }
  if (item.tier === 'pack') return { ...common, tier: 'pack', interval: null, paidDays: null }
  return { ...common, tier: item.tier, interval: item.kind === 'monthly' ? 'month' : 'year', paidDays: item.kind === 'monthly' ? 30 : 365 }
}
export function checklist(item: Editor) {
  if (!item.draft) return []
  const original = item.current ? desiredPrices([asProduct(item, item.current)], 'v2') : []
  return desiredPrices([asProduct(item, item.draft)], 'v2').map(want => {
    const oldCents = original.find(p => p.lookupKey === want.lookupKey)?.unitAmount
    return { ...want, oldCents, oldId: item.bindings[want.lookupKey], reuse: oldCents === want.unitAmount }
  })
}
