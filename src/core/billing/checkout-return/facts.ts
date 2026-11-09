import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { z } from 'zod'

import { PRODUCT_IDS, type ProductId } from '../../config'
import { paymentGrantKey, paymentGrants } from '../payment-grants'
import { AppError } from '../../errors'
import { logger } from '../../logger'
import { CHECKOUT_METHODS, RECORDED_METHODS, type CheckoutMethod, type RecordedMethod } from '../stripe/catalog'
import type { StripeApi } from '../stripe/client'
import type { ReturnQuery } from './query'

// What the return page knows about one purchase (T43), all read on the server: Stripe for the
// session, its renewal date and the hosted receipt; our payments row (written by the webhook in
// the same transaction as the credits) for whether the credits are in. Read only: nothing here
// grants anything, so a refresh or a forged address cannot add credits.
export type CheckoutFacts = {
  grantedCredits?: number | null
  productId: ProductId
  // The payments row exists: the credits are in the account.
  settled: boolean
  // The buyer left Stripe without paying (session still open or expired).
  abandoned: boolean
  // The payments row's method once settled (Alipay or WeChat Pay on the wallet line, T73); before
  // that the route the session was opened on.
  method: RecordedMethod | null
  amount: { minor: number; currency: string } | null
  card: { brand: string; last4: string } | null
  receiptUrl: string | null
  // A card subscription (Stripe, or Waffo since T50): it renews unless cancelled.
  recurring: boolean
  // Its next renewal, ISO, once known; null for one-time purchases.
  renewsAt: string | null
  // Names this one payment for the once-only celebration (T55): the Stripe session id, or
  // Waffo's payment id (its order id on rows from before T50).
  paymentKey: string | null
}

export type FactsDeps = { stripe: StripeApi; db: SupabaseClient }

const paymentRow = z.object({
  amount_total: z.number().int(),
  currency: z.string(),
  method: z.enum(RECORDED_METHODS),
  stripe_session_id: z.string().nullable().optional(),
  stripe_invoice_id: z.string().nullable().optional(),
  stripe_charge_id: z.string().nullable().optional(),
  waffo_order_id: z.string().nullable().optional(),
  waffo_payment_id: z.string().nullable().optional(),
})
type PaymentRow = z.infer<typeof paymentRow> & { grantedCredits?: number | null }

const productIdOf = (value: unknown): ProductId | null => {
  const parsed = z.enum(PRODUCT_IDS).safeParse(value)
  return parsed.success ? parsed.data : null
}

// Waffo's session lives 30 minutes; a payment older than this is not the one just made.
const WAFFO_WINDOW_MS = 2 * 60 * 60 * 1000

export async function readCheckoutFacts(deps: FactsDeps, userId: string, query: ReturnQuery): Promise<CheckoutFacts | null> {
  return query.channel === 'stripe' ? stripeFacts(deps, userId, query.sessionId) : waffoFacts(deps.db, userId, query.productId)
}

async function stripeFacts(deps: FactsDeps, userId: string, sessionId: string): Promise<CheckoutFacts | null> {
  const session = await retrieveSession(deps.stripe, sessionId)
  // Someone else's session reads as not found: never confirm it exists.
  if (!session || session.metadata?.user_id !== userId) return null
  const productId = productIdOf(session.metadata?.product_id)
  if (!productId) return null
  if (session.status !== 'complete') return { ...unsettled(productId), abandoned: true }
  const row = await readPayment(deps.db, userId, (q) => q.eq('user_id', userId).eq('stripe_session_id', session.id))
  const recurring = { recurring: session.mode === 'subscription', renewsAt: renewsAt(session) }
  if (!row) return { ...unsettled(productId), method: methodOfSession(session), amount: sessionAmount(session), ...recurring }
  return { ...settledFacts(productId, row), ...(await chargeDetails(deps.stripe, row)), ...recurring, paymentKey: session.id }
}

function unsettled(productId: ProductId): CheckoutFacts {
  return { productId, settled: false, abandoned: false, method: null, amount: null, card: null, receiptUrl: null, recurring: false, renewsAt: null, paymentKey: null }
}

function settledFacts(productId: ProductId, row: PaymentRow): CheckoutFacts {
  return { ...unsettled(productId), settled: true, grantedCredits: row.grantedCredits, method: row.method, amount: { minor: row.amount_total, currency: row.currency } }
}

// The card and Stripe's hosted receipt, from the charge the payments row recorded.
async function chargeDetails(stripe: StripeApi, row: PaymentRow): Promise<Pick<CheckoutFacts, 'card' | 'receiptUrl'>> {
  const charge = row.stripe_charge_id ? await retrieveCharge(stripe, row.stripe_charge_id) : null
  const card = charge?.payment_method_details?.card
  return { card: card?.last4 ? { brand: card.brand ?? 'card', last4: card.last4 } : null, receiptUrl: charge?.receipt_url ?? null }
}

async function waffoFacts(db: SupabaseClient, userId: string, productId: ProductId): Promise<CheckoutFacts> {
  const since = new Date(Date.now() - WAFFO_WINDOW_MS).toISOString()
  // payments_user_id_created_at_idx: this user's rows, newest first.
  const row = await readPayment(db, userId, (q) =>
    q.eq('user_id', userId).eq('product_id', productId).eq('channel', 'waffo').gte('created_at', since).order('created_at', { ascending: false }).limit(1),
  )
  if (!row) return unsettled(productId)
  // A membership paid by card on Waffo is a subscription (T50); its next renewal is the
  // mirror's period end once subscription.activated is in (subscriptions_waffo_order_id_key).
  const recurring = !productId.startsWith('pack_') && row.method === 'card'
  const renews = recurring && row.waffo_order_id ? await mirrorPeriodEnd(db, userId, row.waffo_order_id) : null
  return { ...settledFacts(productId, row), recurring, renewsAt: renews, paymentKey: row.waffo_payment_id ?? row.waffo_order_id ?? null }
}

async function mirrorPeriodEnd(db: SupabaseClient, userId: string, orderId: string): Promise<string | null> {
  const { data, error } = await db
    .from('subscriptions')
    .select('current_period_end, cancel_at_period_end, status')
    .eq('waffo_order_id', orderId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `checkout return: mirror read failed: ${error.message}`)
  const row = z.object({ current_period_end: z.string(), cancel_at_period_end: z.boolean(), status: z.string() }).nullable().parse(data)
  return row && row.status === 'active' && !row.cancel_at_period_end ? new Date(row.current_period_end).toISOString() : null
}

type PaymentsQuery = ReturnType<ReturnType<SupabaseClient['from']>['select']>

async function readPayment(db: SupabaseClient, userId: string, filter: (query: PaymentsQuery) => PaymentsQuery): Promise<PaymentRow | null> {
  const { data, error } = await filter(db.from('payments').select('amount_total, currency, method, stripe_session_id, stripe_invoice_id, stripe_charge_id, waffo_order_id, waffo_payment_id')).maybeSingle()
  if (error) throw new AppError('INTERNAL', `checkout return: payments read failed: ${error.message}`)
  if (data === null) return null
  const row = paymentRow.parse(data)
  const key = paymentGrantKey(row)
  const grants = await paymentGrants(db, userId, [key])
  return { ...row, grantedCredits: grants.get(key ?? '') ?? null }
}

async function retrieveSession(stripe: StripeApi, id: string): Promise<Stripe.Checkout.Session | null> {
  try {
    return await stripe.checkout.sessions.retrieve(id, { expand: ['subscription'] })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'resource_missing') return null
    throw error
  }
}

// The receipt and card are extras: if Stripe is slow or the charge is gone, the page still says
// the credits are in.
async function retrieveCharge(stripe: StripeApi, id: string): Promise<Stripe.Charge | null> {
  try {
    return await stripe.charges.retrieve(id)
  } catch (error) {
    logger.warn('checkout return: charge not readable', { charge: id, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

function methodOfSession(session: Stripe.Checkout.Session): CheckoutMethod | null {
  const method = session.metadata?.method
  return CHECKOUT_METHODS.find((m) => m === method) ?? null
}

function sessionAmount(session: Stripe.Checkout.Session): CheckoutFacts['amount'] {
  return session.amount_total === null || !session.currency ? null : { minor: session.amount_total, currency: session.currency }
}

function renewsAt(session: Stripe.Checkout.Session): string | null {
  const sub = session.subscription
  if (!sub || typeof sub === 'string' || sub.cancel_at_period_end) return null
  const end = sub.items.data[0]?.current_period_end
  return end ? new Date(end * 1000).toISOString() : null
}
