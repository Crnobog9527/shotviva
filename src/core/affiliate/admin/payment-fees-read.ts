import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { checked } from './read'

const cents = z.number().int().safe()
const id = z.union([z.number().int().safe(), z.string().regex(/^\d+$/)]).transform(String)

const schedule = z.object({
  id, channel: z.string(), method: z.string(), kind: z.string(), rate_bp: z.number().int(), fixed_cents: z.number().int(),
  rounding: z.string(), effective_from: z.string(), active: z.boolean(), note: z.string().nullable(), updated_at: z.string(),
})
export type Schedule = z.infer<typeof schedule>

export async function paymentFeeSchedules(db: SupabaseClient) {
  const rows = checked(await db.from('payment_fee_schedules')
    .select('id,channel,method,kind,rate_bp,fixed_cents,rounding,effective_from,active,note,updated_at')
    .order('channel').order('method').order('kind').order('effective_from', { ascending: false }).limit(500))
  return schedule.array().parse(rows)
}

const payment = z.object({
  id, created_at: z.string(), channel: z.string(), method: z.string(), product_id: z.string(), status: z.string(),
  amount_total: cents, amount_tax: cents, amount_refunded: cents, currency: z.string(),
  fee_status: z.enum(['estimated', 'final']).nullable(), fee_cents: cents.nullable(),
})
const line = z.object({
  id, refund_id: z.string().nullable(), revision: z.number().int(), line_no: z.number().int(), kind: z.string(),
  rate_bp: z.number().int().nullable(), fixed_cents: z.number().int().nullable(), amount_cents: cents,
  source: z.string(), status: z.enum(['estimated', 'final']), source_ref: z.string().nullable(), note: z.string().nullable(),
})
const commissionOnPayment = z.object({
  id, level: z.number(), rate_bp: z.number(), amount: cents, status: z.string(), base_usd: cents,
  fee_cents: cents.nullable(), net_base_usd: cents.nullable(),
})
export type PaymentLine = z.infer<typeof line>

/** One payment with every fee line of every revision (so a correction is visible) and its commissions. */
export async function paymentFees(db: SupabaseClient, paymentId: string) {
  const [p, l, c] = await Promise.all([
    db.from('payments').select('id,created_at,channel,method,product_id,status,amount_total,amount_tax,amount_refunded,currency,fee_status,fee_cents').eq('id', paymentId).maybeSingle(),
    db.from('payment_fee_lines').select('id,refund_id,revision,line_no,kind,rate_bp,fixed_cents,amount_cents,source,status,source_ref,note').eq('payment_id', paymentId)
      .order('refund_id', { ascending: true, nullsFirst: true }).order('revision').order('line_no').limit(500),
    db.from('affiliate_commissions').select('id,level,rate_bp,amount,status,base_usd,fee_cents,net_base_usd').eq('payment_id', paymentId).order('level').limit(10),
  ])
  const found = payment.nullable().parse(checked(p))
  if (!found) return null
  return { payment: found, lines: line.array().parse(checked(l)), commissions: commissionOnPayment.array().parse(checked(c)) }
}

async function countPayments(db: SupabaseClient, from: string, state: 'missing' | 'estimated' | 'final') {
  const base = db.from('payments').select('id', { count: 'exact' }).limit(1).gte('created_at', from)
  const result = await (state === 'missing' ? base.is('fee_status', null) : base.eq('fee_status', state))
  if (result.error) throw new Error('payment fee count failed')
  return result.count ?? 0
}

const monthRow = z.object({ channel: z.string(), method: z.string(), fee_cents: cents.nullable() })

/** The simple reconciliation view until the daily job exists: counts by fee state and 31-day totals. */
export async function feeOverview(db: SupabaseClient) {
  const settings = checked(await db.from('payment_fee_settings').select('record_from').single())
  const recordFrom = z.object({ record_from: z.string().nullable() }).parse(settings).record_from
  if (!recordFrom) return { recordFrom, missing: 0, estimated: 0, final: 0, totals: [] }
  const [missing, estimated, final] = await Promise.all([
    countPayments(db, recordFrom, 'missing'),
    countPayments(db, recordFrom, 'estimated'),
    countPayments(db, recordFrom, 'final'),
  ])
  const since = new Date(Date.now() - 31 * 86_400_000).toISOString()
  const rows = monthRow.array().parse(checked(await db.from('payments').select('channel,method,fee_cents')
    .not('fee_status', 'is', null).gte('created_at', since).limit(5000)))
  const sums = new Map<string, { channel: string; method: string; payments: number; cents: number }>()
  for (const r of rows) {
    const key = r.channel + '|' + r.method
    const sum = sums.get(key) ?? { channel: r.channel, method: r.method, payments: 0, cents: 0 }
    sums.set(key, { ...sum, payments: sum.payments + 1, cents: sum.cents + (r.fee_cents ?? 0) })
  }
  return { recordFrom, missing, estimated, final, totals: [...sums.values()] }
}
