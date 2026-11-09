import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { discountedPriceCents } from '../codes'
import { readPendingDiscount } from '../codes/read'
import type { MembershipTier, PaymentChannel, SiteProduct } from '../config'
import { AppError } from '../errors'
import { hasMemberRate, quoteCheckout, type CheckoutPrice, type PricingVersion } from './checkout-price'
import { bestPackOffer } from './pack-price'
import type { CheckoutBody } from './stripe/checkout'
import { currentTier } from './tier'

export type SelectedCode = { code: string; percent: number }
export type BuyerQuote = { price: CheckoutPrice; selectedCode?: SelectedCode | null }

export function assertPricingVersions(build: PricingVersion, active: PricingVersion, request: CheckoutBody['pricing_version']) {
  if (active !== build || (request ?? 'v1') !== (build ?? 'v1')) {
    throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Review the prices on the current catalog')
  }
}

export async function buyerQuote(admin: SupabaseClient, user: string, product: SiteProduct, body: CheckoutBody, channel: PaymentChannel): Promise<BuyerQuote> {
  const [tier, pending] = await Promise.all([
    hasMemberRate(product) ? currentTier(admin, user) : null,
    channel === 'stripe' ? readPendingDiscount(admin, user) : null,
  ])
  return chooseOffer(product, tier, pending, body)
}

function chooseOffer(product: SiteProduct, tier: MembershipTier | null, pending: Awaited<ReturnType<typeof readPendingDiscount>>, body: CheckoutBody) {
  const eligible = pending?.products.includes(product.id) ? pending : null
  const best = product.tier === 'pack' ? bestPackOffer(product, tier, eligible?.percent ?? null) : subscriptionOffer(product, eligible)
  const selectedCode = best.useCode && eligible ? { code: eligible.code, percent: eligible.percent } : null
  checkDisplayed(body, best.cents, selectedCode)
  // A winning coupon applies to the full list Price. Otherwise bill the member rate directly.
  return { price: quoteCheckout(product, selectedCode ? null : tier), selectedCode }
}

function subscriptionOffer(product: SiteProduct, code: SelectedCode | null) {
  const list = Math.round(product.priceUsd * 100)
  return code ? { cents: discountedPriceCents(list, code.percent), useCode: true } : { cents: list, useCode: false }
}

function checkDisplayed(body: CheckoutBody, cents: number, selectedCode: SelectedCode | null) {
  if (body.expected_price_cents !== cents || (body.expected_code && body.expected_code !== selectedCode?.code)) {
    throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Checkout quote changed; review the current price')
  }
}
