import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { purchaseSource, type PurchaseSource } from './source'

// /admin/orders reads (Plan A): purchases from the ledger, subscriptions from T9's mirror.
// Indexes: credit_ledger_purchases_created_at_id_idx (0166) for purchases; products and the
// subscriber emails are looked up by primary key.

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `admin orders ${what} failed`, { cause: new Error(error.message) })
}

const purchaseRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  created_at: z.string(),
  user_id: z.uuid(),
  product_id: z.string().nullable(),
  idempotency_key: z.string(),
})

export type AdminPurchase = PurchaseSource & {
  id: string
  createdAt: string
  userId: string
  email: string | null
  productId: string | null
  // List price at read time (products.price_usd); not the amount charged.
  listPriceUsd: number | null
}

// Emails come live from Auth, one call per distinct user on the page (≤ 30), never copied.
async function emailsFor(db: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  const found = await Promise.all(unique.map(async (id) => [id, (await db.auth.admin.getUserById(id)).data.user?.email ?? null] as const))
  return new Map(found)
}

async function listPrices(db: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await db.from('products').select('id, price_usd')
  if (error) fail('products', error)
  const rows = z.array(z.object({ id: z.string(), price_usd: z.coerce.number() })).parse(data)
  return new Map(rows.map((row) => [row.id, row.price_usd]))
}

export async function listPurchases(db: SupabaseClient, cursor?: string | null): Promise<Page<AdminPurchase>> {
  let query = db
    .from('credit_ledger')
    .select('id, created_at, user_id, product_id, idempotency_key')
    .eq('kind', 'purchase')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after))
  const [{ data, error }, prices] = await Promise.all([query, listPrices(db)])
  if (error) fail('purchases', error)
  const rows = purchaseRow.array().parse(data)
  const emails = await emailsFor(db, rows.slice(0, PAGE_SIZE).map((row) => row.user_id))
  return toPage(rows, (row) => ({
    ...purchaseSource(row.idempotency_key),
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    email: emails.get(row.user_id) ?? null,
    productId: row.product_id,
    listPriceUsd: row.product_id ? (prices.get(row.product_id) ?? null) : null,
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
