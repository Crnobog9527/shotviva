import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { decodeCursor, encodeCursor, PAGE_SIZE } from './cursor'
import { toMessage } from './reads'
import { readFailed, supportRpc } from './rpc'
import { TICKET_STATUSES, TICKET_TYPES } from './rules'
import { adminReplySchema, decideRefundSchema, ticketIdSchema, type AdminListFilter } from './schema'
import type { AdminPayment, AdminTicket, AdminTicketRow, Page, RefundEligibility } from './types'

// The Owner's side, service-role client only; pages and actions call requireAdmin() first.
// Nothing here moves money: a refund is made by hand in the Stripe / Waffo dashboard.

const decision = z.enum(['approved', 'rejected']).nullable()

const listRow = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  email: z.string().nullable(),
  type: z.enum(TICKET_TYPES),
  status: z.enum(TICKET_STATUSES),
  refund_decision: decision,
  created_at: z.string(),
  last_message_at: z.string(),
  preview: z.string().nullable(),
  tier: z.enum(['starter', 'pro', 'max']).nullable(),
  due_at: z.string(),
})
type ListRow = z.infer<typeof listRow>

function toAdminRow(row: ListRow, now: number): AdminTicketRow {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    type: row.type,
    status: row.status,
    refundDecision: row.refund_decision,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    preview: row.preview,
    tier: row.tier,
    dueAt: row.due_at,
    // Only a ticket waiting for the Owner can be late.
    overdue: row.status === 'open' && Date.parse(row.due_at) < now,
  }
}

// admin_list_tickets (0226): the open view soonest due first, keyset on (due_at, id); the other
// views most recently active first, keyset on (last_message_at, id).
export async function listAdminTickets(
  db: SupabaseClient,
  filter: AdminListFilter,
  rawCursor?: string | null,
  now = Date.now(),
): Promise<Page<AdminTicketRow>> {
  const cursor = decodeCursor(rawCursor)
  const rows = await supportRpc(
    db,
    'admin_list_tickets',
    {
      p_status: filter.status === 'all' ? null : filter.status,
      p_type: filter.type ?? null,
      p_cursor_at: cursor?.c ?? null,
      p_cursor_id: cursor?.i ?? null,
      p_limit: PAGE_SIZE + 1,
    },
    listRow.array(),
  )
  const page = rows.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  const key = (row: ListRow) => (filter.status === 'open' ? row.due_at : row.last_message_at)
  return {
    items: page.map((row) => toAdminRow(row, now)),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor({ c: key(last), i: last.id }) : null,
  }
}

// The nav badge and the overview: an exact count on support_tickets_open_last_message_idx.
export async function openTicketCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from('support_tickets').select('id', { count: 'exact' }).eq('status', 'open').limit(1)
  if (error) readFailed('openTicketCount', error)
  return count ?? 0
}

const ticketRow = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  type: z.enum(TICKET_TYPES),
  status: z.enum(TICKET_STATUSES),
  payment_id: z.union([z.number(), z.string()]).transform(String).nullable(),
  job_id: z.uuid().nullable(),
  refund_decision: decision,
  refund_amount_cents: z.number().nullable(),
  created_at: z.string(),
  closed_at: z.string().nullable(),
  support_ticket_messages: z
    .object({ id: z.uuid(), author: z.enum(['user', 'admin']), body: z.string(), created_at: z.string() })
    .array(),
})

const paymentRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  product_id: z.string(),
  channel: z.enum(['stripe', 'waffo']),
  stripe_session_id: z.string().nullable(),
  stripe_invoice_id: z.string().nullable(),
  stripe_charge_id: z.string().nullable(),
  waffo_order_id: z.string().nullable(),
  waffo_payment_id: z.string().nullable(),
  amount_total: z.number(),
  amount_tax: z.number(),
  amount_refunded: z.number(),
  currency: z.string(),
  method: z.string(),
  status: z.string(),
  created_at: z.string(),
})

const PAYMENT_COLUMNS =
  'id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, waffo_order_id, waffo_payment_id, amount_total, amount_tax, amount_refunded, currency, method, status, created_at'

function toPayment(row: z.infer<typeof paymentRow>): AdminPayment {
  return {
    id: row.id,
    productId: row.product_id,
    channel: row.channel,
    stripeSessionId: row.stripe_session_id,
    stripeInvoiceId: row.stripe_invoice_id,
    stripeChargeId: row.stripe_charge_id,
    waffoOrderId: row.waffo_order_id,
    waffoPaymentId: row.waffo_payment_id,
    amountTotal: row.amount_total,
    amountTax: row.amount_tax,
    amountRefunded: row.amount_refunded,
    currency: row.currency,
    method: row.method,
    status: row.status,
    createdAt: row.created_at,
  }
}

async function loadPayment(db: SupabaseClient, id: string): Promise<AdminPayment | null> {
  const { data, error } = await db.from('payments').select(PAYMENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) readFailed('loadPayment', error)
  return data ? toPayment(paymentRow.parse(data)) : null
}

const eligibilityRow = z.tuple([
  z.object({ first_purchase: z.boolean(), within_7_days: z.boolean(), no_credits_used: z.boolean(), suggested_cents: z.number().int() }),
])

// Hints only: the Owner decides. Seven days are counted to when the user asked.
async function loadEligibility(db: SupabaseClient, paymentId: string, askedAt: string): Promise<RefundEligibility> {
  const [row] = await supportRpc(db, 'refund_eligibility', { p_payment_id: paymentId, p_asked_at: askedAt }, eligibilityRow)
  return { firstPurchase: row.first_purchase, within7Days: row.within_7_days, noCreditsUsed: row.no_credits_used, suggestedCents: row.suggested_cents }
}

// The ticket by primary key with its thread (support_ticket_messages_ticket_id_created_at_idx);
// then, for a payment, the payment row by primary key and, on refunds, the three checks.
export async function loadAdminTicket(db: SupabaseClient, id: string): Promise<AdminTicket | null> {
  if (!ticketIdSchema.safeParse(id).success) return null
  const { data, error } = await db
    .from('support_tickets')
    .select('id, user_id, type, status, payment_id, job_id, refund_decision, refund_amount_cents, created_at, closed_at, support_ticket_messages(id, author, body, created_at)')
    .eq('id', id)
    .order('created_at', { referencedTable: 'support_ticket_messages', ascending: true })
    .maybeSingle()
  if (error) readFailed('loadAdminTicket', error)
  if (!data) return null
  const row = ticketRow.parse(data)
  const paymentId = row.payment_id
  const [payment, eligibility] = await Promise.all([
    paymentId ? loadPayment(db, paymentId) : null,
    paymentId && row.type === 'refund' ? loadEligibility(db, paymentId, row.created_at) : null,
  ])
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    jobId: row.job_id,
    refundDecision: row.refund_decision,
    refundAmountCents: row.refund_amount_cents,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    messages: row.support_ticket_messages.map(toMessage),
    payment,
    eligibility,
  }
}

const anyRow = z.object({ id: z.uuid() })

export async function replyTicket(db: SupabaseClient, input: unknown): Promise<void> {
  const parsed = adminReplySchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请填写回复内容（最多 2000 字）')
  const { ticketId, body, close } = parsed.data
  await supportRpc(db, 'admin_reply_ticket', { p_ticket_id: ticketId, p_body: body, p_close: close }, anyRow)
}

// Records the decision, the reply and the audit row (decide_refund) in one transaction.
export async function decideRefund(db: SupabaseClient, input: unknown): Promise<void> {
  const parsed = decideRefundSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请填写回复；同意时金额必须是正整数（分）')
  const value = parsed.data
  await supportRpc(
    db,
    'admin_decide_refund',
    {
      p_ticket_id: value.ticketId,
      p_decision: value.decision,
      p_amount_cents: value.decision === 'approved' ? value.amountCents : null,
      p_body: value.body,
    },
    anyRow,
  )
}
