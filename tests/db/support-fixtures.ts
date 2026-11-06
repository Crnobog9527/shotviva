import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'

import { createTicket } from '@/core/support'

import { serviceSupabase } from './supabase-env'

// T27 fixtures: payments and credit use written straight into the tables (their own writers are
// tested elsewhere), and tickets made through the real create_support_ticket.

type PaymentOptions = {
  productId?: string
  total?: number
  tax?: number
  refunded?: number
  // When the payment happened, relative to now.
  daysAgo?: number
}

export async function payment(db: Client, userId: string, opts: PaymentOptions = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.payments
       (user_id, product_id, channel, stripe_session_id, amount_total, amount_tax, amount_refunded, currency, method, created_at)
     values ($1, $2, 'stripe', $3, $4, $5, $6, 'usd', 'card', now() - make_interval(secs => $7 * 86400))
     returning id::text`,
    [userId, opts.productId ?? 'pack_s', `cs_${randomUUID()}`, opts.total ?? 990, opts.tax ?? 0, opts.refunded ?? 0, opts.daysAgo ?? 0],
  )
  return rows[0]!.id
}

// One credit used (a reserve), from either pool, at a moment relative to now.
export async function usedCredit(db: Client, userId: string, pool: 'free' | 'paid', minutesAgo = 0) {
  await db.query(
    `insert into public.credit_ledger (user_id, kind, delta, balance_after, reason, idempotency_key, pool, created_at)
     values ($1, 'reserve', -1, 0, 't27 test', $2, $3, now() - make_interval(mins => $4))`,
    [userId, `t27:${randomUUID()}`, pool, minutesAgo],
  )
}

export async function workOf(db: Client, userId: string): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into public.generation_jobs
       (id, user_id, module, template_id, source, status, visibility, credits_cost, output_key, finished_at, credit_pool)
     values ($1, $2, 'image', 'freeform', 'web', 'succeeded', 'public', 2, $3, now(), 'free')`,
    [id, userId, `outputs/${userId}/${id}.png`],
  )
  return id
}

export function ticket(userId: string, input: Record<string, unknown> = {}): Promise<string> {
  return createTicket(serviceSupabase(), userId, { type: 'feedback', body: 'Love it', ...input })
}

export async function ticketRow(db: Client, id: string) {
  const { rows } = await db.query<{
    status: string
    refund_decision: string | null
    refund_amount_cents: number | null
    closed_at: Date | null
    last_message_at: Date
    user_seen_at: Date
  }>('select status, refund_decision, refund_amount_cents, closed_at, last_message_at, user_seen_at from public.support_tickets where id = $1', [id])
  return rows[0] ?? null
}

export async function adminReply(ticketId: string, body = 'Thanks, fixed.', close = false) {
  const { error } = await serviceSupabase().rpc('admin_reply_ticket', { p_ticket_id: ticketId, p_body: body, p_close: close })
  if (error) throw new Error(error.message)
}
