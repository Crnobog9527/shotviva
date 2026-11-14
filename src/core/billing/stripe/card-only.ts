import 'server-only'

import { logger } from '../../logger'
import { CARD_ONLY_CONFIG_NAME } from './catalog'
import type { StripeApi } from './client'

// The card-only payment method configuration (catalog CARD_ONLY_CONFIG_NAME, T64), found by name
// like Prices are found by lookup key, so no id sits in code or env. Cached per function
// instance once found. Missing, the session still goes out card-only in its own params (Link off,
// card filter), only Apple Pay / Google Pay may show; that is logged so the setup run is noticed.
let cached: string | undefined

export async function cardOnlyConfigId(stripe: StripeApi): Promise<string | null> {
  if (cached) return cached
  const { data } = await stripe.paymentMethodConfigurations.list({ limit: 100 })
  const found = data.find((c) => c.active && c.name === CARD_ONLY_CONFIG_NAME)
  if (!found) {
    logger.warn('stripe: card-only payment method configuration missing; run scripts/stripe-setup.ts --apply', { name: CARD_ONLY_CONFIG_NAME })
    return null
  }
  cached = found.id
  return found.id
}

// Tests reset between fixtures.
export function clearCardOnlyCache(): void {
  cached = undefined
}
