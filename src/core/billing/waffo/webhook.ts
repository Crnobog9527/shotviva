import 'server-only'

import { verify as verifySignature, type KeyObject } from 'node:crypto'

import { z } from 'zod'

import { notifyOwner } from '../../alerts'
import { captureAlert, captureError } from '../../analytics/capture-error'
import { logger } from '../../logger'
import type { WaffoMode } from './config'
import { waffoFailureAlert, waffoRefundAlert } from './failure-alert'
import { fulfilWaffoOrder, type WaffoFulfilDeps } from './fulfil'
import { SUBSCRIPTION_STATE_EVENTS, applySubscriptionEvent } from './subscription-sync'

// POST /api/webhooks/waffo (ARCHITECTURE §6.3, AGENTS §6), same rules as Stripe: verify the
// signature over the raw bytes first (bad → 400, nothing applied), then dedupe by event id, then
// apply_purchase; a processing failure → 500 so Waffo redelivers (up to 3 retries).
// Waffo signs `${t}.${rawBody}` with RSA-SHA256 (X-Waffo-Signature: t=<ms>,v1=<base64>). Its
// retries replay the original t and the last one lands 31+ minutes later, so the window is 45
// minutes as Waffo recommends; replays inside it are harmless because the grant is idempotent.
// Grants: order.completed (a one-time order paid) and subscription.payment_succeeded (a card
// subscription's first payment and every renewal, T50); both carry the payment id as eventId.
// The other subscription.* events only update the subscriptions mirror (subscription-sync.ts).
// refund.succeeded is recorded and alerted (Sentry, and the Owner's Feishu group, T72), never
// clawed back automatically yet (§6.2, same as Stripe's charge.refunded; T71 changes that).
// Everything else (plan changes we never start) is acknowledged.

export const WAFFO_SIGNATURE_WINDOW_MS = 45 * 60 * 1000
const FUTURE_SKEW_MS = 60 * 1000

export type WaffoWebhookDeps = WaffoFulfilDeps & {
  publicKey: KeyObject
  storeId: string
  mode: WaffoMode
  now?: () => number
}

export type WaffoWebhookResult = { status: 200 | 400 | 500; body: Record<string, unknown> }

const envelopeSchema = z.object({
  eventType: z.string().min(1),
  timestamp: z.string().optional(),
  eventId: z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/),
  storeId: z.string(),
  mode: z.enum(['test', 'prod']),
  data: z.record(z.string(), z.unknown()),
})
export type WaffoEvent = z.infer<typeof envelopeSchema>

type VerifyDeps = Pick<WaffoWebhookDeps, 'publicKey' | 'storeId' | 'mode' | 'now'>

// True only for a well-formed header, a timestamp inside the window and a valid signature.
function signatureValid(deps: VerifyDeps, body: string, header: string | null): boolean {
  const parts = /^t=(\d{13}),v1=([A-Za-z0-9+/]+={0,2})$/.exec(header ?? '')
  if (!parts) return false
  const [, t, v1] = parts as unknown as [string, string, string]
  const age = (deps.now ?? Date.now)() - Number(t)
  if (age > WAFFO_SIGNATURE_WINDOW_MS || age < -FUTURE_SKEW_MS) return false
  try {
    return verifySignature('sha256', Buffer.from(`${t}.${body}`), deps.publicKey, Buffer.from(v1, 'base64'))
  } catch {
    return false
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export function verifyWaffoEvent(deps: VerifyDeps, body: string, header: string | null): WaffoEvent | null {
  if (!signatureValid(deps, body, header)) return null
  const event = envelopeSchema.safeParse(parseJson(body))
  // A valid signature for another store or the other environment is still not ours.
  if (!event.success || event.data.storeId !== deps.storeId || event.data.mode !== deps.mode) return null
  return event.data
}

async function refundAlert(event: WaffoEvent): Promise<WaffoWebhookResult> {
  const fields = { event_id: event.eventId, order_id: String(event.data.orderId ?? ''), payment_id: String(event.data.paymentId ?? '') }
  logger.warn('waffo refund recorded', fields)
  captureAlert('charge_refunded', 'Waffo refund.succeeded: adjust credits by hand if needed', { fields })
  await notifyOwner(waffoRefundAlert(event))
  return { status: 200, body: { received: true } }
}

export async function handleWaffoWebhook(
  deps: WaffoWebhookDeps,
  request: { body: string; signature: string | null },
): Promise<WaffoWebhookResult> {
  const event = verifyWaffoEvent(deps, request.body, request.signature)
  if (!event) {
    logger.warn('waffo webhook signature rejected')
    captureAlert('payment_webhook_signature', 'Waffo webhook signature rejected')
    return { status: 400, body: { code: 'INVALID_SIGNATURE' } }
  }
  if (event.eventType === 'refund.succeeded') return refundAlert(event)
  try {
    const outcome = await route(deps, event)
    if (outcome === null) return { status: 200, body: { received: true } }
    logger.info('waffo event applied', { event_id: event.eventId, type: event.eventType, outcome })
    return { status: 200, body: { received: true, outcome } }
  } catch (error) {
    logger.error('waffo webhook failed', { event_id: event.eventId, type: event.eventType, error })
    captureError(error, { alert: 'payment_webhook_failed', fields: { event_id: event.eventId, event_type: event.eventType } })
    await notifyOwner(waffoFailureAlert(event))
    return { status: 500, body: { code: 'WEBHOOK_FAILED' } }
  }
}

const STATE_EVENTS: readonly string[] = SUBSCRIPTION_STATE_EVENTS

// null: an event this site does not act on.
function route(deps: WaffoWebhookDeps, event: WaffoEvent): Promise<string> | null {
  if (event.eventType === 'order.completed') return fulfilWaffoOrder(deps, event)
  if (event.eventType === 'subscription.payment_succeeded') return fulfilWaffoOrder(deps, event, 'subscription')
  if (STATE_EVENTS.includes(event.eventType)) return applySubscriptionEvent(deps.db, event)
  return null
}
