import 'server-only'

import type Stripe from 'stripe'

import { notifyOwner } from '../../alerts'
import { captureAlert, captureError } from '../../analytics/capture-error'
import { logger } from '../../logger'
import { stripeFailureAlert } from './failure-alert'
import { fulfilCheckoutSession, type FulfilDeps } from './fulfil'
import { recordDispute, recordRefund } from './payment-issues'
import { renewFromInvoice } from './renewal'
import { syncSubscription } from './subscription-sync'

// POST /api/webhooks/stripe (ARCHITECTURE §6.3, AGENTS §6): verify the signature first (bad
// signature → 400, nothing applied), then handle; a processing failure → 500 so Stripe retries.
// Every handler re-reads its object from Stripe (the event body is only a notification), so
// redelivered and out-of-order events act on Stripe's current state, and each write is keyed so
// a replay changes nothing: settle_checkout by session id, apply_subscription_renewal by invoice
// id, sync_subscription and record_payment_issue write absolute state.

type Handler = (deps: FulfilDeps, objectId: string) => Promise<string>

// The seven events the Stripe endpoint subscribes to. Anything else answers 200 untouched.
// async_payment_succeeded: a delayed method completes the session unpaid and confirms later;
// both session events settle the same session id.
const HANDLERS: Record<string, Handler> = {
  'checkout.session.completed': fulfilCheckoutSession,
  'checkout.session.async_payment_succeeded': fulfilCheckoutSession,
  'invoice.paid': renewFromInvoice,
  'customer.subscription.updated': syncSubscription,
  'customer.subscription.deleted': syncSubscription,
  'charge.refunded': recordRefund,
  'charge.dispute.created': recordDispute,
}

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
  const handler = HANDLERS[event.type]
  if (!handler) return { status: 200, body: { received: true } }

  const objectId = (event.data.object as { id: string }).id
  const fields = { event_id: event.id, event_type: event.type, object_id: objectId }
  try {
    const outcome = await handler(deps, objectId)
    logger.info('stripe webhook handled', { ...fields, outcome })
    return { status: 200, body: { received: true, outcome } }
  } catch (error) {
    logger.error('stripe webhook failed', { ...fields, error })
    captureError(error, { alert: 'payment_webhook_failed', fields })
    // Stripe retries this event for days; the Owner hears once (deduped by event id).
    await notifyOwner(stripeFailureAlert(event))
    return { status: 500, body: { code: 'WEBHOOK_FAILED' } }
  }
}
