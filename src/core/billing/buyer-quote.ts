import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { readPendingDiscount } from '../codes/read'
import type { MembershipTier, PaymentChannel, SiteProduct } from '../config'
import { AppError } from '../errors'
import { hasMemberRate, quoteCheckout, type CheckoutPrice } from './checkout-price'
import { bestPackOffer } from './pack-price'
import type { CheckoutBody } from './stripe/checkout'
import { currentTier } from './tier'

export type PackCode = { code: string; percent: number }
export type BuyerQuote = { price: CheckoutPrice; packCode?: PackCode | null }

export async function buyerQuote(admin: SupabaseClient, user: string, product: SiteProduct, body: CheckoutBody, channel: PaymentChannel): Promise<BuyerQuote> {
  if (product.tier !== 'pack') return { price: quoteCheckout(product, null) }
  const [tier, pending] = await Promise.all([
    hasMemberRate(product) ? currentTier(admin, user) : null,
    channel === 'stripe' ? readPendingDiscount(admin, user) : null,
  ])
  return choosePack(product, tier, pending, body)
}

function choosePack(product: SiteProduct, tier: MembershipTier | null, pending: Awaited<ReturnType<typeof readPendingDiscount>>, body: CheckoutBody) {
  const eligible = pending?.products.includes(product.id) ? pending : null
  const best = bestPackOffer(product, tier, eligible?.percent ?? null)
  const packCode = best.useCode && eligible ? { code: eligible.code, percent: eligible.percent } : null
  checkDisplayed(body, best.cents, packCode)
  // A winning coupon applies to the full list Price. Otherwise bill the member rate directly.
  return { price: quoteCheckout(product, packCode ? null : tier), packCode }
}

function checkDisplayed(body: CheckoutBody, cents: number, packCode: PackCode | null) {
  if ((body.expected_price_cents != null && body.expected_price_cents !== cents) || (body.expected_code && body.expected_code !== packCode?.code)) {
    throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Credit pack quote changed; review the current price')
  }
}
