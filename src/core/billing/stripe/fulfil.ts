import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import { applyPurchase } from '../credits'
import { CHECKOUT_METHODS, lookupKey, type CheckoutMethod } from './catalog'
import type { StripeApi } from './client'
import { mirrorSubscription } from './subscription-mirror'

// First payment and one-time purchases (ARCHITECTURE §6.1, §6.3): a paid Checkout Session
// becomes exactly one apply_purchase, keyed by the session id, so redelivered events, the
// completed + async_payment_succeeded pair, and any retry settle once.

export type FulfilDeps = {
  stripe: StripeApi
  db: SupabaseClient
  products: readonly SiteProduct[]
  trackBuy?: typeof trackPurchase
}

export type FulfilOutcome = 'applied' | 'replayed' | 'unpaid'

type SessionPurchase = { userId: string; product: SiteProduct; method: CheckoutMethod; subscription: Stripe.Subscription | null }

const metadataSchema = z.object({ user_id: z.uuid(), product_id: z.string(), method: z.enum(CHECKOUT_METHODS) })

function invalid(session: Stripe.Checkout.Session, what: string): AppError {
  return new AppError('INVALID_INPUT', `checkout session ${session.id}: ${what}`)
}

function readOwner(session: Stripe.Checkout.Session) {
  const meta = metadataSchema.safeParse(session.metadata ?? {})
  if (!meta.success) throw invalid(session, 'metadata')
  if (session.client_reference_id !== meta.data.user_id) throw invalid(session, 'client_reference_id')
  return meta.data
}

// Our own metadata says what was bought; the charged Price's metadata (set by
// scripts/stripe-setup.ts) must agree, so a session never grants another product.
function readProduct(session: Stripe.Checkout.Session, productId: string, products: readonly SiteProduct[]) {
  const product = products.find((p) => p.id === productId)
  if (!product) throw invalid(session, 'unknown product')
  const price = onlyPrice(session)
  if (price?.metadata?.product_id !== product.id) throw invalid(session, 'line item')
  const form = session.mode === 'subscription' ? 'subscription' : 'one_time'
  if (price.lookup_key !== lookupKey(product.id, form)) throw invalid(session, 'lookup key')
  return product
}

function onlyPrice(session: Stripe.Checkout.Session): Stripe.Price | null {
  const items = session.line_items?.data ?? []
  return items.length === 1 ? (items[0]?.price ?? null) : null
}

function readPurchase(session: Stripe.Checkout.Session, products: readonly SiteProduct[]): SessionPurchase {
  const owner = readOwner(session)
  const product = readProduct(session, owner.product_id, products)
  const subscription = typeof session.subscription === 'object' ? session.subscription : null
  if (session.mode === 'subscription' && !subscription) throw invalid(session, 'subscription not expanded')
  return { userId: owner.user_id, product, method: owner.method, subscription }
}

function track(deps: FulfilDeps, session: Stripe.Checkout.Session, purchase: SessionPurchase): void {
  const { product } = purchase
  ;(deps.trackBuy ?? trackPurchase)(purchase.userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: session.mode === 'subscription' ? 'subscription' : 'one_time',
    channel: 'stripe',
    method: purchase.method,
    // Before tax: Managed Payments adds tax on top and keeps it.
    amount_usd: (session.amount_subtotal ?? Math.round(product.priceUsd * 100)) / 100,
    credits: product.credits,
  })
}

export async function fulfilCheckoutSession(deps: FulfilDeps, sessionId: string): Promise<FulfilOutcome> {
  // Re-read from Stripe: the event body is only a notification, and the expanded subscription
  // is its state now, whatever order the events arrived in.
  const session = await deps.stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items.data.price', 'subscription'],
  })
  if (session.payment_status === 'unpaid') return 'unpaid'
  const purchase = readPurchase(session, deps.products)
  // Mirror first: if the grant then fails, the retry repeats both and the grant still lands once.
  if (purchase.subscription) {
    await mirrorSubscription(deps.db, purchase.subscription, { userId: purchase.userId, productId: purchase.product.id })
  }
  const change = await applyPurchase(deps.db, {
    userId: purchase.userId,
    productId: purchase.product.id,
    eventId: session.id,
  })
  if (!change.applied) return 'replayed'
  track(deps, session, purchase)
  return 'applied'
}
