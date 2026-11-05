import { randomUUID } from 'node:crypto'

import Stripe from 'stripe'
import { vi } from 'vitest'

import type { ProductId } from '@/core/config'
import { lookupKey, priceCents, type CheckoutMethod, type StripeApi, type WebhookDeps } from '@/core/billing/stripe'
import { site } from '@/site/site.config'

import { serviceSupabase } from './supabase-env'

// Signed fake webhooks (AGENTS §7 test 2): the real SDK signs and verifies, and the Stripe API
// is a map of sessions the test controls, so the database side runs for real.

export const WEBHOOK_SECRET = `whsec_test_${randomUUID().replaceAll('-', '')}`
const sdk = new Stripe('sk_test_unused')

export function stripeHarness() {
  const sessions = new Map<string, Stripe.Checkout.Session>()
  const retrieve = vi.fn(async (id: string) => {
    const found = sessions.get(id)
    if (!found) throw new Error(`no such session ${id}`)
    return structuredClone(found)
  })
  const stripe = {
    webhooks: sdk.webhooks,
    checkout: { sessions: { retrieve, create: vi.fn() } },
    prices: { list: vi.fn() },
  } as unknown as StripeApi
  const trackBuy = vi.fn()
  const deps: WebhookDeps = {
    stripe,
    db: serviceSupabase(),
    products: site.billing.products,
    webhookSecret: WEBHOOK_SECRET,
    trackBuy,
  }
  return { deps, sessions, retrieve, trackBuy }
}

export function subscriptionObject(input: { periodEndDays: number; cancelAtPeriodEnd?: boolean; status?: Stripe.Subscription.Status }) {
  const periodEnd = Math.floor(Date.now() / 1000) + input.periodEndDays * 24 * 60 * 60
  return {
    id: `sub_${randomUUID().replaceAll('-', '')}`,
    object: 'subscription',
    status: input.status ?? 'active',
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    items: { object: 'list', data: [{ id: 'si_1', current_period_end: periodEnd }] },
  } as unknown as Stripe.Subscription
}

type SessionInput = {
  userId: string
  productId: ProductId
  method: CheckoutMethod
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus
  subscription?: Stripe.Subscription
  // Tampering: what the charged Price says it is, if not the product bought.
  priceProductId?: string
  clientReferenceId?: string
}

// A session as Stripe returns it with line_items.data.price and subscription expanded.
export function checkoutSession(input: SessionInput): Stripe.Checkout.Session {
  const product = site.billing.products.find((p) => p.id === input.productId)
  if (!product) throw new Error(input.productId)
  const mode = input.subscription ? 'subscription' : 'payment'
  const metadata = { user_id: input.userId, product_id: input.productId, method: input.method }
  return {
    id: `cs_test_${randomUUID().replaceAll('-', '')}`,
    object: 'checkout.session',
    mode,
    payment_status: input.paymentStatus ?? 'paid',
    client_reference_id: input.clientReferenceId ?? input.userId,
    metadata,
    amount_subtotal: priceCents(product),
    line_items: {
      object: 'list',
      data: [
        {
          id: 'li_1',
          price: {
            id: `price_${input.productId}`,
            lookup_key: lookupKey(input.productId, mode === 'subscription' ? 'subscription' : 'one_time'),
            metadata: { product_id: input.priceProductId ?? input.productId },
          },
        },
      ],
    },
    subscription: input.subscription ?? null,
  } as unknown as Stripe.Checkout.Session
}

export function eventFor(type: string, sessionId: string, id = `evt_${randomUUID().replaceAll('-', '')}`) {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-09-30.endive',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { id: sessionId, object: 'checkout.session' } },
  }
}

export function signed(event: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event)
  return { body, signature: sdk.webhooks.generateTestHeaderString({ payload: body, secret }) }
}
