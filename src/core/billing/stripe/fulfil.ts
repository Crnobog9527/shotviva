import 'server-only'

import type Stripe from 'stripe'
import { z } from 'zod'

import { trackPurchase } from '../../analytics/funnel'
import type { SiteProduct } from '../../config'
import { AppError } from '../../errors'
import type { CheckoutPrice } from '../checkout-price'
import { readQuote } from '../read-quote'
import type { ApplyPaymentCodes } from '../payment-code-effects'
import type { RpcClient } from '../rpc'
import type { CancelOthers, CancelRefunded } from '../subscription/cancel-others'
import { CHECKOUT_METHODS, type CheckoutMethod, type RecordedMethod } from './catalog'
import type { StripeApi } from './client'
import type { DisputeEvidenceConfig } from './disputes/config'
import { sessionDiscount } from './discount-facts'
import { recordPaymentContext } from './payment-context'
import { SESSION_EXPAND, sessionFacts } from './payment-facts'
import { matchesContractPrice } from './prices'
import { settleCheckout, subscriptionState } from './settle'

// First payment and one-time purchases (ARCHITECTURE §6.1, §6.3): a paid Checkout Session
// becomes exactly one settle_checkout (mirror + apply_purchase), keyed by the session id, so
// redelivered events, the completed + async_payment_succeeded pair, and any retry settle once.
// A membership bought while another runs is an upgrade (§6.2 「升级」, T66): apply_purchase
// grants it in full at once, then the other renewing subscriptions are cancelled.

export type FulfilDeps = {
  stripe: StripeApi
  // Service-role client: settle_checkout is not callable by the client roles.
  db: RpcClient
  products: readonly SiteProduct[]
  applyCodes: ApplyPaymentCodes
  trackBuy?: typeof trackPurchase
  // The upgrade step (T66): after a membership is paid, cancel the buyer's other renewing
  // subscriptions. Wired by the webhook route and the admin replay; absent in tests that only settle.
  cancelOthers?: CancelOthers
  // T71: a refunded membership's own subscription is cancelled at once. Wired by the webhook route.
  cancelRefunded?: CancelRefunded
  // T82: the dispute evidence wiring (site facts, admin link). Wired by the webhook route; absent
  // in the admin replay, which never sees a dispute.
  evidence?: DisputeEvidenceConfig
}

export type FulfilOutcome = 'applied' | 'replayed' | 'unpaid'

export type SessionPurchase = { userId: string; product: SiteProduct; quote?: CheckoutPrice; method: CheckoutMethod; subscription: Stripe.Subscription | null }

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
  const line = onlyLineItem(session)
  if (!line?.price) throw invalid(session, 'line item')
  const price = line.price
  const form = session.mode === 'subscription' ? 'subscription' : 'one_time'
  const quote = readQuote(session.metadata ?? {}, product)
  if (!matchesContractPrice(price, product, form, quote)) throw invalid(session, 'lookup key or quoted price')
  if (quote && line.quantity !== 1) {
    throw invalid(session, 'quoted price differs from line item')
  }
  return { product, quote }
}

function onlyLineItem(session: Stripe.Checkout.Session) {
  const items = session.line_items?.data ?? []
  return items.length === 1 ? items[0] : undefined
}

export function readPurchase(session: Stripe.Checkout.Session, products: readonly SiteProduct[]): SessionPurchase {
  const owner = readOwner(session)
  const { product, quote } = readProduct(session, owner.product_id, products)
  const subscription = typeof session.subscription === 'object' ? session.subscription : null
  if (session.mode === 'subscription' && !subscription) throw invalid(session, 'subscription not expanded')
  return { userId: owner.user_id, product, quote, method: owner.method, subscription }
}

// The webhook has no page: the language is the one the Checkout Session was opened in.
function track(deps: FulfilDeps, session: Stripe.Checkout.Session, purchase: SessionPurchase, method: RecordedMethod, discount: ReturnType<typeof sessionDiscount>): void {
  const { product } = purchase
  ;(deps.trackBuy ?? trackPurchase)(purchase.userId, {
    product_id: product.id,
    tier: product.tier,
    interval: product.interval,
    form: session.mode === 'subscription' ? 'subscription' : 'one_time',
    channel: 'stripe',
    // What paid, as payments.method records it: on the wallet line Alipay or WeChat Pay.
    method,
    // Before tax: Managed Payments adds tax on top and keeps it.
    amount_usd: discount.amountUsd,
    ...discount.props,
    ...(purchase.quote && { credits: purchase.quote.credits }),
  }, session.locale === 'zh' ? 'zh' : 'en')
}

function pricingVersionOf(quote?: CheckoutPrice) {
  return quote ? 'v2' as const : undefined
}

export async function fulfilCheckoutSession(deps: FulfilDeps, sessionId: string): Promise<FulfilOutcome> {
  // Re-read from Stripe: the event body is only a notification, and the expanded subscription
  // is its state now, whatever order the events arrived in.
  const session = await deps.stripe.checkout.sessions.retrieve(sessionId, { expand: SESSION_EXPAND })
  if (session.payment_status === 'unpaid') return 'unpaid'
  const purchase = readPurchase(session, deps.products)
  const payment = await sessionFacts(deps.stripe, session, purchase.method)
  const change = await settleCheckout(deps.db, {
    userId: purchase.userId,
    productId: purchase.product.id,
    version: pricingVersionOf(purchase.quote),
    sessionId: session.id,
    subscription: purchase.subscription ? subscriptionState(purchase.subscription) : null,
    payment,
  })
  const discount = sessionDiscount(session, purchase.product)
  if (change.applied) track(deps, session, purchase, payment.method, discount)
  await deps.applyCodes({
    channel: 'stripe', reference: session.id, userId: purchase.userId, productId: purchase.product.id,
    codeId: discount.codeId, amountDiscount: discount.amountDiscount, locale: session.locale === 'zh' ? 'zh' : 'en',
  })
  // Dispute evidence (T82): the checkout IP, browser and Terms consent on the payment row. Also on
  // a replay, so a crash between the two calls is mended by Stripe's redelivery. Best effort: a
  // failure is logged and alerted, never fails this webhook or skips the step below.
  await recordPaymentContext(deps.db, session)
  // Also on a replay: a crash after settling would otherwise leave the old plan billing. The
  // step is idempotent (ended rows are skipped).
  if (purchase.product.tier !== 'pack') await deps.cancelOthers?.(purchase.userId, { stripeSubscriptionId: purchase.subscription?.id ?? null })
  return change.applied ? 'applied' : 'replayed'
}
