import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { DETAIL_ROWS, SAME_IP_ROWS, type GraylumLink, type SameIpAccount, type UserExtras, type UserPayment, type UserRequest, type UserSubscription } from './detail-types'

// The five T25 blocks on /admin/users/[id] (ARCHITECTURE §10「用户详情补全」), one query each,
// only the listed columns. Index per query:
//   payments        payments_user_id_created_at_idx (0180)
//   subscriptions   subscriptions_user_id_idx; current_tier() reads the profile by primary key
//                   and credit_ledger_user_id_created_at_idx
//   graylum         partner_links primary key (user_id, partner)
//   same IP         profiles_signup_ip_created_at_idx (0180)
//   requests        template_requests_user_id_created_at_idx

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `admin user ${what} failed`, { cause: new Error(error.message) })
}

const paymentRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  created_at: z.string(),
  product_id: z.string(),
  channel: z.enum(['stripe', 'waffo']),
  stripe_session_id: z.string().nullable(),
  stripe_invoice_id: z.string().nullable(),
  stripe_charge_id: z.string().nullable(),
  waffo_order_id: z.string().nullable(),
  amount_total: z.number(),
  amount_tax: z.number(),
  amount_refunded: z.number(),
  currency: z.string(),
  method: z.string(),
  status: z.string(),
})

export async function userPayments(db: SupabaseClient, userId: string): Promise<UserPayment[]> {
  const { data, error } = await db
    .from('payments')
    .select('id, created_at, product_id, channel, stripe_session_id, stripe_invoice_id, stripe_charge_id, waffo_order_id, amount_total, amount_tax, amount_refunded, currency, method, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(DETAIL_ROWS)
  if (error) fail('payments', error)
  return paymentRow.array().parse(data).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    productId: row.product_id,
    channel: row.channel,
    // The id the Owner searches Stripe / Waffo by: session first, then invoice.
    providerId: row.stripe_session_id ?? row.stripe_invoice_id ?? row.waffo_order_id,
    chargeId: row.stripe_charge_id,
    amountTotal: row.amount_total,
    amountTax: row.amount_tax,
    amountRefunded: row.amount_refunded,
    currency: row.currency,
    method: row.method,
    status: row.status,
  }))
}

const subscriptionRow = z.object({
  stripe_subscription_id: z.string().nullable(),
  waffo_order_id: z.string().nullable(),
  product_id: z.string(),
  status: z.string(),
  current_period_end: z.string(),
  cancel_at_period_end: z.boolean(),
})

export async function userSubscription(db: SupabaseClient, userId: string): Promise<UserSubscription> {
  const [subs, tier] = await Promise.all([
    db
      .from('subscriptions')
      .select('stripe_subscription_id, waffo_order_id, product_id, status, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false })
      .limit(3),
    db.rpc('current_tier', { p_user_id: userId }),
  ])
  if (subs.error) fail('subscriptions', subs.error)
  if (tier.error) fail('tier', tier.error)
  return {
    tier: z.string().nullable().parse(tier.data),
    subscriptions: subscriptionRow.array().parse(subs.data).map((row) => ({
      // sub_… (Stripe) or ORD_… (Waffo, T50).
      id: row.stripe_subscription_id ?? row.waffo_order_id ?? '',
      productId: row.product_id,
      status: row.status,
      periodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
    })),
  }
}

const linkRow = z.object({ linked_at: z.string().nullable(), revoked_at: z.string().nullable(), created_at: z.string() })

export async function userGraylumLink(db: SupabaseClient, userId: string): Promise<GraylumLink | null> {
  const { data, error } = await db
    .from('partner_links')
    .select('linked_at, revoked_at, created_at')
    .eq('user_id', userId)
    .eq('partner', 'graylum')
    .maybeSingle()
  if (error) fail('graylum', error)
  if (!data) return null
  const row = linkRow.parse(data)
  return { connected: row.linked_at !== null && row.revoked_at === null, linkedAt: row.linked_at, revokedAt: row.revoked_at }
}

const sameIpRow = z.object({ id: z.uuid(), created_at: z.string(), free_credits: z.number(), banned_at: z.string().nullable() })

export async function sameIpAccounts(db: SupabaseClient, userId: string, signupIp: string | null): Promise<SameIpAccount[]> {
  if (!signupIp) return []
  const { data, error } = await db
    .from('profiles')
    .select('id, created_at, free_credits, banned_at')
    .eq('signup_ip', signupIp)
    .neq('id', userId)
    .order('created_at', { ascending: false })
    .limit(SAME_IP_ROWS)
  if (error) fail('same ip', error)
  return sameIpRow.array().parse(data).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    freeCredits: row.free_credits,
    bannedAt: row.banned_at,
  }))
}

const requestRow = z.object({ id: z.uuid(), created_at: z.string(), status: z.string(), description: z.string(), votes_count: z.number() })

export async function userRequests(db: SupabaseClient, userId: string): Promise<UserRequest[]> {
  const { data, error } = await db
    .from('template_requests')
    .select('id, created_at, status, description, votes_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(DETAIL_ROWS)
  if (error) fail('requests', error)
  return requestRow.array().parse(data).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    status: row.status,
    description: row.description,
    votes: row.votes_count,
  }))
}

// All five blocks at once; the signup IP comes from the profile the page already read.
export async function loadUserExtras(db: SupabaseClient, user: { id: string; signupIp: string | null }): Promise<UserExtras> {
  const [payments, subscription, graylum, sameIp, requests] = await Promise.all([
    userPayments(db, user.id),
    userSubscription(db, user.id),
    userGraylumLink(db, user.id),
    sameIpAccounts(db, user.id, user.signupIp),
    userRequests(db, user.id),
  ])
  return { signupIp: user.signupIp, payments, subscription, graylum, sameIp, requests }
}
