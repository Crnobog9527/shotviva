import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { maskPhone } from '../auth/phone/phone-number'
import type { OwnerAlert, RefundAlert, TicketAlert } from './alert-kinds'
import { LOOKUP_TIMEOUT_MS } from './failure-spike'

// The lookups only the message needs, done in the after() work behind the dedupe and only when
// alerts are on. Each is bounded by LOOKUP_TIMEOUT_MS and falls back to a shorter message.

// j***@gmail.com, or 138****5678 for a phone-only account (T63).
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  if (at < 1) return ''
  return `${email[0]}***${email.slice(at)}`
}

// auth.admin calls take no abort signal: race them against a timer instead.
function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS)
  })
  return Promise.race([work.catch(() => fallback), late]).finally(() => clearTimeout(timer))
}

export async function whoIs(db: SupabaseClient, userId: string): Promise<string | null> {
  const lookup = db.auth.admin.getUserById(userId).then(({ data, error }) => {
    if (error || !data.user) return null
    return maskEmail(data.user.email) || maskPhone(data.user.phone) || null
  })
  return withTimeout(lookup, null)
}

const signal = () => AbortSignal.timeout(LOOKUP_TIMEOUT_MS)

const waffoPaymentSchema = z.object({ user_id: z.uuid(), product_id: z.string(), amount_total: z.number().int(), currency: z.string() })

// Waffo's refund.succeeded names the payment only (payments_waffo_payment_id_key).
async function withWaffoPayment(db: SupabaseClient, alert: RefundAlert): Promise<RefundAlert> {
  if (!alert.waffoPaymentId) return alert
  const { data } = await db
    .from('payments')
    .select('user_id, product_id, amount_total, currency')
    .eq('waffo_payment_id', alert.waffoPaymentId)
    .abortSignal(signal())
    .maybeSingle()
  const payment = waffoPaymentSchema.safeParse(data)
  if (!payment.success) return alert
  const { user_id, product_id, amount_total, currency } = payment.data
  return { ...alert, userId: user_id, productId: product_id, amount: { cents: amount_total, currency } }
}

const ticketSchema = z.object({ type: z.string() })
const messagesSchema = z.array(z.object({ author: z.enum(['user', 'admin']) }))

// How many messages the user has sent since the Owner last answered: the newest 50 on
// support_ticket_messages_ticket_id_created_at_idx, counted until the first admin one.
function pendingCount(rows: z.infer<typeof messagesSchema>): number {
  const answered = rows.findIndex((row) => row.author === 'admin')
  return answered === -1 ? rows.length : answered
}

async function withTicketFacts(db: SupabaseClient, alert: TicketAlert): Promise<TicketAlert> {
  if (!alert.reply) return alert
  const [ticket, messages] = await Promise.all([
    db.from('support_tickets').select('type').eq('id', alert.ticketId).abortSignal(signal()).maybeSingle(),
    db.from('support_ticket_messages').select('author').eq('ticket_id', alert.ticketId).order('created_at', { ascending: false }).limit(50).abortSignal(signal()),
  ])
  const type = ticketSchema.safeParse(ticket.data)
  const rows = messagesSchema.safeParse(messages.data)
  return { ...alert, ticketType: type.success ? type.data.type : alert.ticketType, pending: rows.success ? pendingCount(rows.data) : null }
}

async function withFacts(db: SupabaseClient, alert: OwnerAlert): Promise<OwnerAlert> {
  if (alert.kind === 'refund') return withWaffoPayment(db, alert)
  if (alert.kind === 'ticket') return withTicketFacts(db, alert)
  return alert
}

// A failed lookup only shortens the message; it never stops the alert.
export async function enrich(db: SupabaseClient, alert: OwnerAlert): Promise<{ alert: OwnerAlert; who: string | null }> {
  const full = await withFacts(db, alert).catch(() => alert)
  const userId = 'userId' in full ? full.userId : null
  return { alert: full, who: userId ? await whoIs(db, userId) : null }
}
