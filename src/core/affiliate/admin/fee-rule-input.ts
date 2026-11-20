import { z } from 'zod'
import { feeKinds, feeMethods } from '../fees'

const percent = z
  .string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
  .pipe(z.number().int().min(0).max(10000))
const usd = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/)
  .transform((s) => Math.round(Number(s) * 100))
const optionalUsd = z.union([z.literal('').transform(() => null), usd])
const label = z.string().trim().min(1).max(80)

const ruleForm = z
  .object({
    id: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
    expected_updated_at: z.string().min(1).max(64).optional(),
    label_zh: label,
    label_en: label,
    kind: z.enum(feeKinds),
    percent: z.union([z.literal('').transform(() => 0), percent]),
    fixed: z.union([z.literal('').transform(() => 0), usd]),
    min: optionalUsd,
    max: optionalUsd,
    active: z.literal('on').optional().transform(Boolean),
    effective_from: z.iso.date(),
    sort_order: z.coerce.number().int().min(0).max(1000),
  })
  // The unused part of the chosen kind is dropped, so a stale value never leaks into the fee.
  .transform(({ percent, fixed, min, max, effective_from, ...rest }) => ({
    ...rest,
    percent_bp: rest.kind === 'fixed' ? 0 : percent,
    fixed_cents: rest.kind === 'percent' ? 0 : fixed,
    min_cents: min,
    max_cents: max,
    effective_from: effective_from + 'T00:00:00Z',
  }))
  .refine((r) => (r.kind === 'fixed' || r.percent_bp > 0) && (r.kind === 'percent' || r.fixed_cents > 0))
  .refine((r) => r.min_cents === null || r.max_cents === null || r.min_cents <= r.max_cents)

/** FormData of the fee rule form → admin_affiliate_fee_rule_save input. Throws ZodError. */
export function feeRuleInput(form: FormData) {
  const fields = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'payout_methods'))
  const methods = z.array(z.enum(feeMethods)).parse(form.getAll('payout_methods'))
  return { ...ruleForm.parse(fields), payout_methods: methods.length ? [...new Set(methods)] : null }
}
