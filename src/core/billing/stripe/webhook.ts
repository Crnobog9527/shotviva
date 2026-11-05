import 'server-only'

import type Stripe from 'stripe'

import { captureAlert, captureError } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { fulfilCheckoutSession, type FulfilDeps } from './fulfil'

// POST /api/webhooks/stripe (ARCHITECTURE §6.3, AGENTS §6): verify the signature first (bad
// signature → 400, nothing applied), then settle; a processing failure → 500 so Stripe retries.
// Dedupe: settle_checkout grants through apply_purchase keyed by the checkout session id
// (§6.1), so every redelivery, retry or sibling event of one session grants once, and its
// mirror upsert writes the state just retrieved from Stripe.
// T10 adds invoice.paid, customer.subscription.updated / deleted and charge.refunded here.

// async_payment_succeeded: a delayed method (if Stripe ever treats Alipay as one) completes the
// session unpaid and confirms later; both events settle the same session id.
const SESSION_EVENTS = new Set<string>(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

export type WebhookDeps = FulfilDeps & { webhookSecret: string }

export type WebhookResult = { status: 200 | 400 | 500; body: Record<string, unknown> }

function verify(deps: WebhookDeps, body: string, signature: string | null): Stripe.Event | null {
  try {
    return deps.stripe.webhooks.constructEvent(body, signature ?? '', deps.webhookSecret)
  } catch {
    return null
  }
}

export async function handleStripeWebhook(
  deps: WebhookDeps,
  request: { body: string; signature: string | null },
): Promise<WebhookResult> {
  const event = verify(deps, request.body, request.signature)
  if (!event) {
    logger.warn('stripe webhook signature rejected')
    captureAlert('payment_webhook_signature', 'Stripe webhook signature rejected')
    return { status: 400, body: { code: 'INVALID_SIGNATURE' } }
  }
  if (!SESSION_EVENTS.has(event.type)) return { status: 200, body: { received: true } }

  const session = event.data.object as Stripe.Checkout.Session
  try {
    const outcome = await fulfilCheckoutSession(deps, session.id)
    logger.info('stripe checkout settled', { event_id: event.id, type: event.type, session_id: session.id, outcome })
    return { status: 200, body: { received: true, outcome } }
  } catch (error) {
    logger.error('stripe webhook failed', { event_id: event.id, type: event.type, session_id: session.id, error })
    captureError(error, {
      alert: 'payment_webhook_failed',
      fields: { event_id: event.id, event_type: event.type, session_id: session.id },
    })
    return { status: 500, body: { code: 'WEBHOOK_FAILED' } }
  }
}
