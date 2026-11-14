import 'server-only'

import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto'

import type { PaymentChannel, ProductId } from '../../config'
import { serverEnv } from '../../env'
import { AppError } from '../../errors'
import type { MembershipProductId } from '../../waffo-env'

// Waffo settings for this deployment (ARCHITECTURE §6.3). core/env.ts has already checked the
// shapes (and that all nine product ids are mapped); this turns them into usable keys.

export type WaffoMode = 'test' | 'prod'

export type WaffoConfig = {
  merchantId: string
  storeId: string
  mode: WaffoMode
  privateKey: KeyObject
  productIds: Record<ProductId, string>
  // The six memberships as recurring products, for card checkouts (T50).
  subscriptionProductIds: Record<MembershipProductId, string>
}

export type WaffoWebhookConfig = { storeId: string; mode: WaffoMode; publicKey: KeyObject }

// The paywall's channel: every checkout goes to this one (no automatic failover).
export function paymentChannel(): PaymentChannel {
  return serverEnv().PAYMENT_CHANNEL
}

// Dashboard pastes arrive as one line with literal "\n", with CRLF, or as a bare base64 body.
// Rewrap them as PEM; the PKCS#1 ("RSA … KEY") label is kept when it was there.
export function normalizePem(raw: string, kind: 'PRIVATE' | 'PUBLIC'): string {
  const text = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\r/g, '')
  const label = text.includes(`BEGIN RSA ${kind} KEY`) ? `RSA ${kind} KEY` : `${kind} KEY`
  const body = text.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '')
  const lines = body.match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function keyFrom(raw: string | undefined, kind: 'PRIVATE' | 'PUBLIC', name: string): KeyObject {
  if (!raw) throw new AppError('INTERNAL', `${name} is not configured`)
  try {
    const pem = normalizePem(raw, kind)
    return kind === 'PRIVATE' ? createPrivateKey(pem) : createPublicKey(pem)
  } catch {
    // Never echo the value: it is a secret.
    throw new AppError('INTERNAL', `${name} is not a valid ${kind.toLowerCase()} key`)
  }
}

export function waffoConfig(): WaffoConfig {
  const env = serverEnv()
  if (!env.WAFFO_MERCHANT_ID || !env.WAFFO_STORE_ID || !env.WAFFO_PRODUCT_IDS || !env.WAFFO_SUBSCRIPTION_PRODUCT_IDS) {
    throw new AppError('INTERNAL', 'Waffo is not configured')
  }
  return {
    merchantId: env.WAFFO_MERCHANT_ID,
    storeId: env.WAFFO_STORE_ID,
    mode: env.WAFFO_ENVIRONMENT,
    privateKey: keyFrom(env.WAFFO_PRIVATE_KEY, 'PRIVATE', 'WAFFO_PRIVATE_KEY'),
    productIds: env.WAFFO_PRODUCT_IDS,
    subscriptionProductIds: env.WAFFO_SUBSCRIPTION_PRODUCT_IDS,
  }
}

// The webhook needs only the store, the environment and the public key, so it keeps working
// (for late events) after the channel is switched back to Stripe.
export function waffoWebhookConfig(): WaffoWebhookConfig {
  const env = serverEnv()
  if (!env.WAFFO_STORE_ID) throw new AppError('INTERNAL', 'WAFFO_STORE_ID is not configured')
  return {
    storeId: env.WAFFO_STORE_ID,
    mode: env.WAFFO_ENVIRONMENT,
    publicKey: keyFrom(env.WAFFO_WEBHOOK_PUBLIC_KEY, 'PUBLIC', 'WAFFO_WEBHOOK_PUBLIC_KEY'),
  }
}
