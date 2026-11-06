import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { paymentSource, type PurchaseSource } from './source'

// /admin/orders reads: payments (T10, what was actually charged) and T9's subscription mirror.
// Indexes: payments_created_at_id_idx (0105) for the payment list; subscriptions keyset on its
// created_at with the primary key; subscriber emails by primary key through Auth.

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `admin orders ${what} failed`, { cause: new Error(error.message) })
}

const PAYMENT_COLUMNS =
  'id, created_at, user_id, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, waffo_order_id, ' +
  'amount_total, amount_tax, amount_refunded, currency, method, status'

const nullableId = z.string().nullable()

const paymentRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  created_at: z.string(),
  user_id: z.uuid(),
  product_id: z.string(),
  channel: z.enum(['stripe', 'waffo']),
  stripe_session_id: nullableId,
  stripe_invoice_id: nullableId,
  stripe_charge_id: nullableId,
  waffo_order_id: nullableId,
  amount_total: z.number().int(),
  amount_tax: z.number().int(),
  amount_refunded: z.number().int(),
  currency: z.string(),
  method: z.enum(['card', 'alipay']),
  status: z.enum(['paid', 'refunded', 'partially_refunded', 'disputed']),
})

export type PaymentStatus = z.infer<typeof paymentRow>['status']

export type AdminPurchase = PurchaseSource & {
  id: string
  createdAt: string
  userId: string
  email: string | null
  productId: string
  // Smallest currency unit, as charged (tax included); the currency may be the buyer's.
  amountTotal: number
  amountTax: number
  amountRefunded: number
  currency: string
  method: 'card' | 'alipay'
  status: PaymentStatus
}

// Emails come live from Auth, one call per distinct user on the page (≤ 30), never copied.
async function emailsFor(db: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  const found = await Promise.all(unique.map(async (id) => [id, (await db.auth.admin.getUserById(id)).data.user?.email ?? null] as const))
  return new Map(found)
}

export async function listPurchases(db: SupabaseClient, cursor?: string | null): Promise<Page<AdminPurchase>> {
  let query = db
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after))
  const { data, error } = await query
  if (error) fail('payments', error)
  const rows = paymentRow.array().parse(data)
  const emails = await emailsFor(db, rows.slice(0, PAGE_SIZE).map((row) => row.user_id))
  return toPage(rows, (row) => ({
    ...paymentSource(row),
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    email: emails.get(row.user_id) ?? null,
    productId: row.product_id,
    amountTotal: row.amount_total,
    amountTax: row.amount_tax,
    amountRefunded: row.amount_refunded,
    currency: row.currency,
    method: row.method,
    status: row.status,
  }))
}

const subscriptionRow = z.object({
  id: z.string(),
  created_at: z.string(),
  user_id: z.uuid(),
  product_id: z.string(),
  status: z.string(),
  current_period_end: z.string(),
  cancel_at_period_end: z.boolean(),
})

export type AdminSubscription = {
  id: string
  userId: string
  email: string | null
  productId: string
  status: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

// One row per subscriber; newest first, keyset on (created_at, stripe_subscription_id).
export async function listSubscriptions(db: SupabaseClient, cursor?: string | null): Promise<Page<AdminSubscription>> {
  let query = db
    .from('subscriptions')
    .select('id:stripe_subscription_id, created_at, user_id, product_id, status, current_period_end, cancel_at_period_end')
    .order('created_at', { ascending: false })
    .order('stripe_subscription_id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after, 'stripe_subscription_id'))
  const { data, error } = await query
  if (error) fail('subscriptions', error)
  const rows = subscriptionRow.array().parse(data)
  const emails = await emailsFor(db, rows.slice(0, PAGE_SIZE).map((row) => row.user_id))
  return toPage(rows, (row) => ({
    id: row.id,
    userId: row.user_id,
    email: emails.get(row.user_id) ?? null,
    productId: row.product_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  }))
}
