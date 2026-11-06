import 'server-only'

import { createHash, sign, type KeyObject } from 'node:crypto'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import { waffoConfig } from './config'

// The one Waffo call this channel makes: create a hosted checkout session (docs.waffo.ai,
// "Create Checkout Session"). API-key auth: RSA-SHA256 over
// METHOD \n PATH \n TIMESTAMP \n base64(sha256(body)). The key decides test or prod; there is
// no environment header to get wrong. No retries: Waffo has no idempotency on this endpoint,
// so a retried create could leave two payable sessions.

export const WAFFO_API_ORIGIN = 'https://api.waffo.ai'
const CREATE_SESSION_PATH = '/v1/actions/checkout/create-session'
const TIMEOUT_MS = 20_000

export type WaffoSessionRequest = {
  productId: string
  currency: 'USD'
  priceSnapshot: { amount: string; taxIncluded: boolean; taxCategory: string }
  successUrl: string
  expiresInSeconds: number
  metadata: Record<string, string>
  orderMerchantExternalId: string
  language: 'en' | 'zh-Hans'
}

// Structural, so tests pass a fake; the real one is waffoClient().
export type WaffoApi = { createCheckoutSession(request: WaffoSessionRequest): Promise<unknown> }

export function signWaffoRequest(input: { path: string; timestamp: string; body: string; privateKey: KeyObject }): string {
  const digest = createHash('sha256').update(input.body).digest('base64')
  const canonical = `POST\n${input.path}\n${input.timestamp}\n${digest}`
  return sign('sha256', Buffer.from(canonical), input.privateKey).toString('base64')
}

type Envelope = { data?: unknown; errors?: { message?: unknown }[] }

export function waffoClient(request: typeof fetch = fetch): WaffoApi {
  const config = waffoConfig()
  return {
    async createCheckoutSession(payload) {
      const body = JSON.stringify(payload)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const signature = signWaffoRequest({ path: CREATE_SESSION_PATH, timestamp, body, privateKey: config.privateKey })
      const response = await request(`${WAFFO_API_ORIGIN}${CREATE_SESSION_PATH}`, {
        method: 'POST',
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'X-Merchant-Id': config.merchantId,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
      })
      const envelope = (await response.json().catch(() => null)) as Envelope | null
      if (!response.ok || !envelope?.data || envelope.errors?.length) {
        // Status and Waffo's own messages only; never the request (it names the buyer).
        const notes = (envelope?.errors ?? []).slice(0, 3).map((e) => String(e.message ?? '').slice(0, 200))
        logger.error('waffo create-session failed', { status: response.status, errors: notes })
        throw new AppError('INTERNAL', `Waffo create-session failed (${response.status})`)
      }
      return envelope.data
    },
  }
}
