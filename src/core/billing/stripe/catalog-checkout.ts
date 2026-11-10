import 'server-only'
import type Stripe from 'stripe'

import { AppError } from '../../errors'
import { finishStripe, lockAttempt, type Attempt } from '../catalog-attempt'
import type { CheckoutDeps } from './checkout'
import type { CheckoutRoute } from './catalog'
import { discountedParams, releaseDiscount, reserveDiscount } from './checkout-discount'

async function checkoutClaim(deps: CheckoutDeps, attempt: Attempt, user: string) {
  const selected = attempt.quote.selectedCode
  if (!selected) return null
  const claim = await reserveDiscount(deps.codes, user, attempt.body, attempt.token, deps.products, selected)
  if (!claim) throw new AppError('CODE_CHECKOUT_OFFER_CHANGED', 'Discount is unavailable')
  return claim
}

export async function catalogCheckout(
  deps: CheckoutDeps,
  attempt: Attempt,
  user: string,
  route: CheckoutRoute,
  price: string,
  params: Stripe.Checkout.SessionCreateParams,
) {
  const claim = await checkoutClaim(deps, attempt, user)
  const frozen = claim ? discountedParams(params, claim) : { ...params, expires_at: Math.floor(Date.now() / 1000) + 24 * 3600 }
  let row
  try {
    row = await lockAttempt(deps.codes, user, attempt, {
      channel: 'stripe',
      price,
      key: route.lookupKey,
      recurring: route.form === 'subscription',
      params: frozen,
    })
  } catch (error) {
    if (
      claim &&
      error instanceof AppError &&
      ['CODE_CHECKOUT_OFFER_CHANGED', 'CODE_CHECKOUT_FLOOR', 'DOWNGRADE_NOT_ALLOWED'].includes(error.code)
    ) {
      await releaseDiscount(deps.codes, user, attempt.token)
    }
    throw error
  }
  // A frozen request may already have been submitted by a concurrent retry. Its coupon
  // stays reserved until the session expires or the checkout cancellation is confirmed.
  return finishStripe(deps.codes, deps.stripe, user, attempt.token, row)
}
