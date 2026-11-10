import { z } from 'zod'
import { MEMBERSHIP_TIERS, productIdSchema, type SiteProduct } from '../config'

const base = z.object({
  product_id: productIdSchema, revision: z.int().positive(), usd_cents: z.int().positive(),
  credits: z.int().positive(), listed: z.boolean(), name_en: z.string(), name_zh: z.string(),
  benefit_en: z.string().optional(), benefit_zh: z.string().optional(),
})

const row = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('pack'), tier: z.literal('pack'), paid_days: z.null() }),
  base.extend({ kind: z.literal('monthly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(30) }),
  base.extend({ kind: z.literal('yearly'), tier: z.enum(MEMBERSHIP_TIERS), paid_days: z.literal(365) }),
])

// A published subset is valid; a repeated identity makes the quote ambiguous.
export const catalog = z.array(row.refine(r => r.kind === 'pack' ? r.product_id.startsWith('pack_') : !r.product_id.startsWith('pack_') && r.product_id.endsWith(`_${r.kind}`)))
  .refine(rows => new Set(rows.map(r => r.product_id)).size === rows.length)

export function catalogProducts(rows: z.infer<typeof catalog>): SiteProduct[] {
  return rows.flatMap((r): SiteProduct[] => {
    const common = { id: r.product_id, credits: r.credits, priceUsd: r.usd_cents / 100, revision: r.revision,
      names: { en: r.name_en, zh: r.name_zh }, benefits: { en: r.benefit_en ?? '', zh: r.benefit_zh ?? '' } }
    if (r.kind === 'pack') return [{ ...common, tier: r.tier, interval: null, paidDays: null }]
    return [{ ...common, tier: r.tier, interval: r.kind === 'monthly' ? 'month' : 'year', paidDays: r.paid_days }]
  })
}

export function listedProducts(rows: z.infer<typeof catalog>): SiteProduct[] {
  return catalogProducts(rows.filter(row => row.listed))
}
