import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { maskPhone } from '../auth/phone/phone-number'
import type { OwnerAlert } from './alert-kinds'

// The lookups only the message needs, done by the notifier after the dedupe and only when alerts
// are on, so call sites stay one line and nothing extra is read when Feishu is not configured.

// j***@gmail.com, or 138****5678 for a phone-only account (T63).
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  if (at < 1) return ''
  return `${email[0]}***${email.slice(at)}`
}

export async function whoIs(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error || !data.user) return null
  return maskEmail(data.user.email) || maskPhone(data.user.phone) || null
}

const waffoPaymentSchema = z.object({
  user_id: z.uuid(),
  product_id: z.string(),
  amount_total: z.number().int(),
  currency: z.string(),
})

// Waffo's refund.succeeded names the payment only (payments_waffo_payment_id_key).
async function withWaffoPayment(db: SupabaseClient, alert: OwnerAlert): Promise<OwnerAlert> {
  if (alert.kind !== 'refund' || !alert.waffoPaymentId) return alert
  const { data } = await db
    .from('payments')
    .select('user_id, product_id, amount_total, currency')
    .eq('waffo_payment_id', alert.waffoPaymentId)
    .maybeSingle()
  const payment = waffoPaymentSchema.safeParse(data)
  if (!payment.success) return alert
  const { user_id, product_id, amount_total, currency } = payment.data
  return { ...alert, userId: user_id, productId: product_id, amount: { cents: amount_total, currency } }
}

// A follow-up message's ticket type (support_tickets primary key), for the 「退款申请」 tag.
async function withTicketType(db: SupabaseClient, alert: OwnerAlert): Promise<OwnerAlert> {
  if (alert.kind !== 'ticket' || alert.ticketType) return alert
  const { data } = await db.from('support_tickets').select('type').eq('id', alert.ticketId).maybeSingle()
  const row = z.object({ type: z.string() }).safeParse(data)
  return row.success ? { ...alert, ticketType: row.data.type } : alert
}

export async function enrich(db: SupabaseClient, alert: OwnerAlert): Promise<{ alert: OwnerAlert; who: string | null }> {
  const full = await withTicketType(db, await withWaffoPayment(db, alert))
  const userId = 'userId' in full ? full.userId : null
  return { alert: full, who: userId ? await whoIs(db, userId) : null }
}
