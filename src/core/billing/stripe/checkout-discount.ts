import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { z } from 'zod'

import { checkoutUnitPriceDifference, type CatalogInput } from '../../codes/admin'
import { AppError } from '../../errors'
import type { RpcClient } from '../rpc'
import type { CheckoutBody } from './checkout'
import type { StripeApi } from './client'

const reserved = z.object({ status: z.literal('reserved'), code_id: z.uuid(), code: z.string(), percent: z.int().min(1).max(90),
  stripe_coupon_id: z.string().min(1), prepared: z.boolean() })
const reservation = z.discriminatedUnion('status', [reserved, z.object({ status: z.literal('in_use') }), z.object({ status: z.literal('expired') })])
export type Discount = z.infer<typeof reserved> & { token: string; expiresAt: number }
export const DISCOUNT_CANCEL_COOKIE = 'sv_code_checkout'

// A browser nonce identifies one retryable purchase. The Stripe key/DB token is namespaced by
// the authenticated account and purchase so a reused nonce cannot acquire a different purchase's lock.
export function checkoutToken(userId: string, body: CheckoutBody, nonce: string | null, products: readonly CatalogInput[]) {
  if (nonce === null) return randomUUID()
  if (!z.uuid().safeParse(nonce).success) throw new AppError('INVALID_INPUT', 'Invalid checkout attempt')
  // Adjacent deployments may serve different prices concurrently. A rejected quote in
  // one must never release the other deployment's in-flight request under the same nonce.
  const economics = products.map(p => [p.id, p.tier, p.priceUsd, p.credits])
  const identity = JSON.stringify(['shotviva:checkout', userId, body.product_id, body.method, body.locale, body.return_to, body.expected_code, nonce, economics])
  const bytes = createHash('sha256').update(identity).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

async function claimDiscount(db: RpcClient, user: string, body: CheckoutBody, token: string) {
  const slot = await db.rpc('reserve_checkout_discount', { p_user: user, p_product_id: body.product_id, p_token: token })
  if (slot.error) throw new AppError(slot.error.message === 'CODE_CHECKOUT_FORBIDDEN' ? 'FORBIDDEN' : 'INTERNAL', 'Discount lookup failed')
  if (slot.data === null) {
    if (body.expected_code) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Discount offer has changed')
    return null
  }
  const claim = reservation.parse(slot.data)
  if (claim.status === 'in_use') throw new AppError('CODE_CHECKOUT_IN_PROGRESS', 'Another checkout is using this discount')
  if (claim.status === 'expired') throw new AppError('CONFLICT', 'This checkout attempt has expired')
  return claim
}

function checkOffer(body: CheckoutBody, claim: z.infer<typeof reserved>, products: readonly CatalogInput[]) {
  if (body.expected_code && claim.code !== body.expected_code) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Discount offer has changed')
  if (checkoutUnitPriceDifference(products, body.product_id, claim.percent) < BigInt(0)) {
    throw new AppError('CODE_CHECKOUT_FLOOR', 'Discounted price is below the current subscription price per credit')
  }
}

export async function reserveDiscount(db: RpcClient, user: string, body: CheckoutBody, token: string, products: readonly CatalogInput[]): Promise<Discount | null> {
  const claim = await claimDiscount(db, user, body, token)
  if (!claim) return null
  try {
    checkOffer(body, claim, products)
  } catch (error) {
    // A prepared retry may refer to a still-payable Session under the preceding catalogue.
    if (!claim.prepared) await releaseDiscount(db, user, token)
    throw error
  }
  // Stripe measures its 30-minute minimum at receipt. The five-second allowance fits the
  // SQL clock/transport window. On retry, prepare returns the original persisted deadline.
  const prepared = await db.rpc('prepare_checkout_discount', { p_user: user, p_token: token, p_expires_at: Math.ceil(Date.now() / 1000) + 1805 })
  if (prepared.error) throw new AppError('INTERNAL', 'Discount preparation failed')
  const result = z.discriminatedUnion('status', [z.object({ status: z.literal('expired') }),
    z.object({ status: z.literal('prepared'), expires_at: z.number().int().positive() })]).parse(prepared.data)
  if (result.status === 'expired') throw new AppError('CONFLICT', 'This checkout attempt has expired')
  return { ...claim, token, expiresAt: result.expires_at }
}

export async function releaseDiscount(db: RpcClient, user: string, token: string) {
  const { error } = await db.rpc('release_checkout_discount', { p_user: user, p_token: token })
  if (error) throw new AppError('INTERNAL', 'Discount release failed')
}

export function discountedParams(params: Stripe.Checkout.SessionCreateParams, claim: Discount) {
  const attribution = { code_id: claim.code_id, code: claim.code }
  const subscription = params.subscription_data
  return { ...params, discounts: [{ coupon: claim.stripe_coupon_id }], expires_at: claim.expiresAt,
    metadata: { ...params.metadata, ...attribution, checkout_token: claim.token },
    ...(subscription && { subscription_data: { ...subscription, metadata: { ...subscription.metadata, ...attribution } } }) }
}

// A create error may hide an already-open session (timeout, 5xx, concurrent/idempotency
// conflict). Only an explicit first-request parameter rejection proves nothing was created.
export function definitelyRejected(error: unknown) {
  const e = z.object({ type: z.literal('StripeInvalidRequestError'), statusCode: z.literal(400), code: z.string().nullish() }).safeParse(error)
  return e.success && e.data.code !== 'idempotency_key_in_use'
}

export async function expireAndRelease(
  stripe: StripeApi, db: RpcClient, user: string, token: string, session: Pick<Stripe.Checkout.Session, 'id' | 'status' | 'metadata'>,
) {
  if (session.metadata?.user_id !== user || session.metadata?.checkout_token !== token || !session.metadata.code_id) return
  if (session.status === 'open') {
    // In a payment-vs-cancel race, expire refuses a completed session. Re-read the authority;
    // async payments already submitted report complete even before funds clear.
    session = await stripe.checkout.sessions.expire(session.id).catch(() => stripe.checkout.sessions.retrieve(session.id))
  }
  if (session.status === 'expired') await releaseDiscount(db, user, token)
}

export function discountedCancelSession(cookie: string | undefined, token: string | null) {
  if (!cookie || !token || !z.uuid().safeParse(token).success) return null
  const match = /^([0-9a-f-]{36}):(cs_[A-Za-z0-9_]{1,240})$/.exec(cookie)
  return match?.[1] === token ? match[2] : null
}
