import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { afterCreated, decodeCursor, encodeCursor, PAGE_SIZE } from './cursor'
import { isUnread, TICKET_STATUSES, TICKET_TYPES } from './rules'
import { readFailed } from './rpc'
import { ticketIdSchema } from './schema'
import type { Page, PaymentOption, TicketMessage, TicketSummary, TicketThread, WorkOption } from './types'

// The author's reads. Tickets and messages run on the viewer's own session client, so RLS
// (support_tickets_select_own) decides what exists. Payments are private (T10), so their
// picker reads with the service role, filtered to the author.

const summaryRow = z.object({
  id: z.uuid(),
  type: z.enum(TICKET_TYPES),
  status: z.enum(TICKET_STATUSES),
  created_at: z.string(),
  last_message_at: z.string(),
  user_seen_at: z.string(),
})
type SummaryRow = z.infer<typeof summaryRow>

const SUMMARY_COLUMNS = 'id, type, status, created_at, last_message_at, user_seen_at'

function toSummary(row: SummaryRow): TicketSummary {
  const ticket = { lastMessageAt: row.last_message_at, userSeenAt: row.user_seen_at }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    unread: isUnread(ticket),
  }
}

// My tickets, newest first, 30 a page, on support_tickets_user_id_created_at_idx.
export async function listMyTickets(client: SupabaseClient, userId: string, rawCursor?: string | null): Promise<Page<TicketSummary>> {
  const cursor = decodeCursor(rawCursor)
  let query = client.from('support_tickets').select(SUMMARY_COLUMNS).eq('user_id', userId)
  if (cursor) query = query.or(afterCreated(cursor))
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (error) readFailed('listMyTickets', error)
  const rows = summaryRow.array().parse(data)
  const page = rows.slice(0, PAGE_SIZE)
  const last = page.at(-1)
  return { items: page.map(toSummary), nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor({ c: last.created_at, i: last.id }) : null }
}

// The dot on the Account tab, read once per page load (no polling, no Realtime: §5.1 rule 8).
// Only the latest few tickets are looked at, on the same index; an older ticket with a new
// reply still shows its dot in My tickets.
const DOT_WINDOW = 10

export async function hasUnreadReply(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('support_tickets')
    .select('last_message_at, user_seen_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(DOT_WINDOW)
  if (error) readFailed('hasUnreadReply', error)
  const rows = z.array(z.object({ last_message_at: z.string(), user_seen_at: z.string() })).parse(data)
  return rows.some((row) => isUnread({ lastMessageAt: row.last_message_at, userSeenAt: row.user_seen_at }))
}

const attachmentRow = z.object({ id: z.uuid(), object_key: z.string(), width: z.number(), height: z.number() })
export const messageRow = z.object({
  id: z.uuid(),
  author: z.enum(['user', 'admin']),
  body: z.string(),
  created_at: z.string(),
  // Embedded on support_ticket_attachments_message_id_idx (T69).
  support_ticket_attachments: attachmentRow.array().default([]),
})
const threadRow = summaryRow.extend({ support_ticket_messages: messageRow.array() })

// The thread's messages with their images, in one request.
export const MESSAGE_COLUMNS = 'id, author, body, created_at, support_ticket_attachments(id, object_key, width, height, created_at)'

export function toMessage(row: z.infer<typeof messageRow>): TicketMessage {
  const attachments = row.support_ticket_attachments.map((a) => ({ id: a.id, objectKey: a.object_key, width: a.width, height: a.height }))
  return { id: row.id, author: row.author, body: row.body, createdAt: row.created_at, attachments }
}

// One ticket with its messages in one request: the ticket by primary key, the thread on
// support_ticket_messages_ticket_id_created_at_idx. Someone else's ticket reads as missing.
export async function loadMyThread(client: SupabaseClient, ticketId: string): Promise<TicketThread | null> {
  if (!ticketIdSchema.safeParse(ticketId).success) return null
  const { data, error } = await client
    .from('support_tickets')
    .select(`${SUMMARY_COLUMNS}, support_ticket_messages(${MESSAGE_COLUMNS})`)
    .eq('id', ticketId)
    .order('created_at', { referencedTable: 'support_ticket_messages', ascending: true })
    .order('created_at', { referencedTable: 'support_ticket_messages.support_ticket_attachments', ascending: true })
    .maybeSingle()
  if (error) readFailed('loadMyThread', error)
  if (!data) return null
  const row = threadRow.parse(data)
  return { ...toSummary(row), messages: row.support_ticket_messages.map(toMessage) }
}

// Page size of the ticket form's pickers; the account page's Purchases list shares the payments one.
export const PICKER_LIMIT = 20

const paymentRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  product_id: z.string(),
  amount_total: z.number(),
  currency: z.string(),
  // cn_card = 中国银行卡, the plain Stripe card route (T64); wechat_pay since T73.
  method: z.enum(['card', 'alipay', 'wechat_pay', 'cn_card']),
  created_at: z.string(),
  channel: z.enum(['stripe', 'waffo']),
  status: z.enum(['paid', 'refunded', 'partially_refunded', 'disputed']),
  stripe_invoice_id: z.string().nullable(),
})

// The author's latest payments for the billing / refund picker and the account page's
// Purchases list, on payments_user_id_created_at_idx.
export async function listPaymentOptions(db: SupabaseClient, userId: string): Promise<PaymentOption[]> {
  const { data, error } = await db
    .from('payments')
    .select('id, product_id, amount_total, currency, method, created_at, channel, status, stripe_invoice_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(PICKER_LIMIT)
  if (error) readFailed('listPaymentOptions', error)
  return paymentRow.array().parse(data).map((row) => ({
    id: row.id,
    productId: row.product_id,
    amountTotal: row.amount_total,
    currency: row.currency,
    method: row.method,
    createdAt: row.created_at,
    channel: row.channel,
    status: row.status,
    hasInvoice: row.stripe_invoice_id !== null,
  }))
}

const workRow = z.object({
  id: z.uuid(),
  template_id: z.string(),
  created_at: z.string(),
  templates: z.object({ name: z.string() }).nullable(),
})

// The author's latest finished works for the image-issue picker, read with their own session
// (generation_jobs_select_own) on generation_jobs_user_id_created_at_idx.
export async function listWorkOptions(client: SupabaseClient, userId: string): Promise<WorkOption[]> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('id, template_id, created_at, templates(name)')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PICKER_LIMIT)
  if (error) readFailed('listWorkOptions', error)
  return workRow.array().parse(data).map((row) => ({
    id: row.id,
    templateName: row.templates?.name ?? row.template_id,
    createdAt: row.created_at,
  }))
}
