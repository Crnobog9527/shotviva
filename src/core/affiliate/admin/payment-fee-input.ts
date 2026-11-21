import { z } from 'zod'

const percent = z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/).transform((s) => Math.round(Number(s) * 100)).pipe(z.number().int().min(0).max(10000))
const usd = z.string().regex(/^\d{1,4}(?:\.\d{1,2})?$/).transform((s) => Math.round(Number(s) * 100)).pipe(z.number().int().min(0).max(100000))

const add = z.object({
  channel: z.enum(['stripe', 'waffo']),
  method: z.enum(['card', 'cn_card', 'alipay', 'wechat_pay']),
  kind: z.enum(['acquiring', 'intl_card', 'fx', 'mp', 'billing', 'radar', 'refund_fee']),
  rounding: z.enum(['half_up', 'ceil']),
  percent: z.union([z.literal('').transform(() => 0), percent]),
  fixed: z.union([z.literal('').transform(() => 0), usd]),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  note: z.string().trim().max(500).optional(),
})
const edit = z.object({
  id: z.string().regex(/^[1-9]\d{0,17}$/),
  expected_updated_at: z.string().min(1).max(64),
  active: z.literal('on').optional().transform(Boolean),
  note: z.string().trim().max(500).optional(),
})

/** FormData of the schedule form → admin_payment_fee_schedule_save input. Throws ZodError. */
export function feeScheduleInput(form: FormData) {
  const fields = Object.fromEntries(form)
  if (fields.id) return edit.parse(fields)
  const { percent: bp, fixed, effective_from, ...rest } = add.parse(fields)
  if (bp === 0 && fixed === 0) throw new z.ZodError([{ code: 'custom', path: ['percent'], message: 'rate required' }])
  return { ...rest, rate_bp: bp, fixed_cents: fixed, effective_from: effective_from + ':00Z' }
}
