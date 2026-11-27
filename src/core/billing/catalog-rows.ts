import { z } from 'zod'
import { MEMBERSHIP_TIERS, type SiteProduct } from '../config'
import { productIdSchema } from '../config/product-id'

const base = z.object({
  product_id: productIdSchema, revision: z.int().positive(), usd_cents: z.int().positive(),
  credits: z.int().positive(), listed: z.boolean(), name_en: z.string(), name_zh: z.string(),
  benefit_en: z.string().optional(), benefit_zh: z.string().optional(),
  // Attached from read_catalog_member_rates (attachMemberRates), not returned by the catalogue reads.
  pack_member_pay_pct: z.tuple([z.int(), z.int(), z.int()]).optional(),
})

const row = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('pack'), tier: z.literal('pack'), paid_days: z.null() }),
  base.extend({ kind: z.literal('monthly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(30) }),
  base.extend({ kind: z.literal('yearly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(365) }),
])

// A published subset is valid; a repeated identity makes the quote ambiguous.
export const catalog = z.array(row.refine(r => r.kind === 'pack' ? r.product_id.startsWith('pack_') : !r.product_id.startsWith('pack_') && r.product_id.endsWith(`_${r.kind}`)))
  .refine(rows => new Set(rows.map(r => r.product_id)).size === rows.length)

// M / L pack member rates per revision (migration 1610), ordered starter, pro, max.
export const memberRates = z.array(z.object({
  product_id: productIdSchema, revision: z.int().positive(),
  starter_pct: z.int().min(50).max(100), pro_pct: z.int().min(50).max(100), max_pct: z.int().min(50).max(100),
}))
export type MemberRates = z.infer<typeof memberRates>

export function attachMemberRates<T extends { product_id: string; revision: number }>(rows: T[], rates: MemberRates) {
  return rows.map((row) => {
    const rate = rates.find(r => r.product_id === row.product_id && r.revision === row.revision)
    return rate ? { ...row, pack_member_pay_pct: [rate.starter_pct, rate.pro_pct, rate.max_pct] as [number, number, number] } : row
  })
}

export function catalogProducts(rows: z.infer<typeof catalog>): SiteProduct[] {
  return rows.flatMap((r): SiteProduct[] => {
    const pay = r.pack_member_pay_pct
    const common = { id: r.product_id, credits: r.credits, priceUsd: r.usd_cents / 100, revision: r.revision,
      names: { en: r.name_en, zh: r.name_zh }, benefits: { en: r.benefit_en ?? '', zh: r.benefit_zh ?? '' },
      ...(pay ? { packMemberPayPct: { starter: pay[0], pro: pay[1], max: pay[2] } } : {}) }
    if (r.kind === 'pack') return [{ ...common, tier: r.tier, interval: null, paidDays: null }]
    return [{ ...common, tier: r.tier, interval: r.kind === 'monthly' ? 'month' : 'year', paidDays: r.paid_days }]
  })
}

export function listedProducts(rows: z.infer<typeof catalog>): SiteProduct[] {
  return catalogProducts(rows.filter(row => row.listed))
}
