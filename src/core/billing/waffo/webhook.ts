import 'server-only'

import { verify as verifySignature, type KeyObject } from 'node:crypto'

import { z } from 'zod'

import { captureAlert, captureError } from '../../analytics/capture-error'
import { logger } from '../../logger'
import type { WaffoMode } from './config'
import { fulfilWaffoOrder, type WaffoFulfilDeps } from './fulfil'

// POST /api/webhooks/waffo (ARCHITECTURE §6.3, AGENTS §6), same rules as Stripe: verify the
// signature over the raw bytes first (bad → 400, nothing applied), then dedupe by event id, then
// apply_purchase; a processing failure → 500 so Waffo redelivers (up to 3 retries).
// Waffo signs `${t}.${rawBody}` with RSA-SHA256 (X-Waffo-Signature: t=<ms>,v1=<base64>). Its
// retries replay the original t and the last one lands 31+ minutes later, so the window is 45
// minutes as Waffo recommends; replays inside it are harmless because the grant is idempotent.
// Only order.completed grants (one-time order paid; its eventId is the payment id and it fires
// once per order). refund.succeeded is recorded and alerted, never clawed back automatically
// (§6.2, same as Stripe's charge.refunded). Everything else is acknowledged and ignored.

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

function refundAlert(event: WaffoEvent): WaffoWebhookResult {
  const fields = { event_id: event.eventId, order_id: String(event.data.orderId ?? ''), payment_id: String(event.data.paymentId ?? '') }
  logger.warn('waffo refund recorded', fields)
  captureAlert('charge_refunded', 'Waffo refund.succeeded: adjust credits by hand if needed', { fields })
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
  if (event.eventType !== 'order.completed') return { status: 200, body: { received: true } }

  try {
    const outcome = await fulfilWaffoOrder(deps, event)
    logger.info('waffo order settled', { event_id: event.eventId, outcome })
    return { status: 200, body: { received: true, outcome } }
  } catch (error) {
    logger.error('waffo webhook failed', { event_id: event.eventId, type: event.eventType, error })
    captureError(error, { alert: 'payment_webhook_failed', fields: { event_id: event.eventId, event_type: event.eventType } })
    return { status: 500, body: { code: 'WEBHOOK_FAILED' } }
  }
}
