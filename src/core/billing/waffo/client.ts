import 'server-only'

import { createHash, sign, type KeyObject } from 'node:crypto'

import { z } from 'zod'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import { waffoConfig } from './config'

// The Waffo calls this channel makes (docs.waffo.ai): create a hosted checkout session for a
// one-time or subscription product, and cancel a card subscription at period end (T50). API-key
// auth: RSA-SHA256 over METHOD \n PATH \n TIMESTAMP \n base64(sha256(body)). The key decides
// test or prod; there is no environment header to get wrong. No retries: create-session has no
// idempotency, so a retried create could leave two payable sessions; a cancel the buyer can
// press again. The one exception is billing-detail.ts: after a 4xx (no session was created) it
// retries once without the company title.

export const WAFFO_API_ORIGIN = 'https://api.waffo.ai'
const CREATE_SESSION_PATH = '/v1/actions/checkout/create-session'
const CANCEL_SUBSCRIPTION_PATH = '/v1/actions/subscription-order/cancel-order'
const TIMEOUT_MS = 20_000

// Pre-fills the buyer side of Waffo's invoice (billing-detail.ts). country and isBusiness are
// required by Waffo whenever billingDetail is sent.
export type WaffoBillingDetail = {
  country: string
  isBusiness: true
  businessName: string
  taxId: string
  postcode?: string
  state?: string
}

export type WaffoSessionRequest = {
  productId: string
  currency: 'USD'
  priceSnapshot: { amount: string; taxIncluded: boolean; taxCategory: string }
  successUrl: string
  expiresInSeconds: number
  metadata: Record<string, string>
  orderMerchantExternalId: string
  language: 'en' | 'zh-Hans'
  // A card subscription offers cards only (T50); one-time sessions offer what the currency has.
  includePaymentMethods?: readonly string[]
  // A blacklist (mutually exclusive with the whitelist); methods the currency lacks are ignored.
  excludePaymentMethods?: readonly string[]
  withTrial?: false
  allowPromotionCodes?: false
  billingDetail?: WaffoBillingDetail
}

// cancel-order answers the order, its new status (`canceling` until the period ends, or
// `canceled`) and when the paid period ends.
const cancelResultSchema = z.object({
  orderId: z.string().min(1),
  status: z.string().min(1),
  currentPeriodEnd: z.string().optional(),
})
export type WaffoCancelResult = z.infer<typeof cancelResultSchema>

// Structural, so tests pass a fake; the real one is waffoClient().
export type WaffoApi = {
  createCheckoutSession(request: WaffoSessionRequest): Promise<unknown>
  cancelSubscription(orderId: string): Promise<WaffoCancelResult>
}

export function signWaffoRequest(input: { path: string; timestamp: string; body: string; privateKey: KeyObject }): string {
  const digest = createHash('sha256').update(input.body).digest('base64')
  const canonical = `POST\n${input.path}\n${input.timestamp}\n${digest}`
  return sign('sha256', Buffer.from(canonical), input.privateKey).toString('base64')
}

type Envelope = { data?: unknown; errors?: { message?: unknown; code?: unknown; extensions?: { code?: unknown } }[] }

// A failed Waffo call, with Waffo's HTTP status so callers can tell a rejected request (4xx: no
// session was created) from an outage.
export class WaffoHttpError extends AppError {
  readonly httpStatus: number
  constructor(label: string, httpStatus: number) {
    super('INTERNAL', `Waffo ${label} failed (${httpStatus})`)
    this.httpStatus = httpStatus
  }
}

export const isWaffoRejection = (error: unknown) => error instanceof WaffoHttpError && error.httpStatus >= 400 && error.httpStatus < 500

// Waffo's error codes only, never its message text: a message can echo what we sent (buyer
// company name, tax ID).
function errorCodes(envelope: Envelope | null): string[] {
  return (envelope?.errors ?? []).slice(0, 3)
    .map((e) => String(e.code ?? e.extensions?.code ?? ''))
    .filter((code) => /^[A-Za-z0-9_.-]{1,64}$/.test(code))
}

async function post(request: typeof fetch, path: string, payload: unknown, label: string): Promise<unknown> {
  const config = waffoConfig()
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = signWaffoRequest({ path, timestamp, body, privateKey: config.privateKey })
  const response = await request(`${WAFFO_API_ORIGIN}${path}`, {
    method: 'POST',
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': config.merchantId, 'X-Timestamp': timestamp, 'X-Signature': signature },
  })
  const envelope = (await response.json().catch(() => null)) as Envelope | null
  if (!response.ok || !envelope?.data || envelope.errors?.length) {
    // Status and Waffo's error codes only; never the request or Waffo's message text.
    logger.error(`waffo ${label} failed`, { status: response.status, codes: errorCodes(envelope) })
    throw new WaffoHttpError(label, response.status)
  }
  return envelope.data
}

export function waffoClient(request: typeof fetch = fetch): WaffoApi {
  return {
    createCheckoutSession: (payload) => post(request, CREATE_SESSION_PATH, payload, 'create-session'),
    async cancelSubscription(orderId) {
      const data = await post(request, CANCEL_SUBSCRIPTION_PATH, { orderId }, 'cancel-order')
      const parsed = cancelResultSchema.safeParse(data)
      if (!parsed.success) throw new AppError('INTERNAL', 'Waffo cancel-order answered an unexpected shape')
      return parsed.data
    },
  }
}

export function readWaffoCatalog(query: string, variables: Record<string, unknown>) {
  return post(fetch, '/v1/graphql', { query, variables }, 'catalog')
}

// F4: a read-only GraphQL query (settlement figures). Same signing as every other call.
export function readWaffoGraphql(query: string, variables: Record<string, unknown>, request: typeof fetch = fetch) {
  return post(request, '/v1/graphql', { query, variables }, 'graphql')
}
