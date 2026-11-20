import { z } from 'zod'

// Payout fee rules (ARCHITECTURE §6.2 联盟返佣 · 打款扣费). The amounts are always computed by the
// database (affiliate_payout_fee_quote); this file only parses and describes them.
export const feeMethods = ['paypal', 'wise', 'bank', 'alipay', 'other'] as const
export const feeKinds = ['percent', 'fixed', 'percent_fixed'] as const
const cents = z.number().int().safe()

export const feeRuleSnapshot = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String),
  label_zh: z.string(),
  label_en: z.string(),
  kind: z.enum(feeKinds),
  percent_bp: z.number().int().min(0).max(10000),
  fixed_cents: cents.nonnegative(),
  min_cents: cents.nonnegative().nullable(),
  max_cents: cents.nonnegative().nullable(),
  payout_methods: z.array(z.enum(feeMethods)).nullable(),
  effective_from: z.string(),
})
export const feeQuote = z.object({
  gross: cents,
  fees: cents.nonnegative(),
  net: cents.nonnegative(),
  lines: z.array(feeRuleSnapshot.extend({ amount: cents.nonnegative() })),
})
export type FeeRule = z.infer<typeof feeRuleSnapshot>
export type FeeQuote = z.infer<typeof feeQuote>

type Words = {
  money: (cents: number) => string
  percent: (bp: number) => string
  min: (amount: string) => string
  max: (amount: string) => string
}

/** "3.5% + $0.50 (min $1.00, max $20.00)" in the caller's locale. */
export function feeFormula(rule: Pick<FeeRule, 'kind' | 'percent_bp' | 'fixed_cents' | 'min_cents' | 'max_cents'>, w: Words) {
  const parts = []
  if (rule.kind !== 'fixed') parts.push(w.percent(rule.percent_bp))
  if (rule.kind !== 'percent') parts.push(w.money(rule.fixed_cents))
  const bounds = []
  if (rule.min_cents !== null) bounds.push(w.min(w.money(rule.min_cents)))
  if (rule.max_cents !== null) bounds.push(w.max(w.money(rule.max_cents)))
  return parts.join(' + ') + (bounds.length ? ' (' + bounds.join(', ') + ')' : '')
}

export function feeLabel(rule: Pick<FeeRule, 'label_zh' | 'label_en'>, locale: string) {
  return locale === 'zh' ? rule.label_zh : rule.label_en
}
