import 'server-only'

import type { EventProps } from './events'
import { track } from './server-track'

// Typed entry points for T9 (checkout and payment webhooks). Both are server events so an
// ad blocker cannot drop them (ARCHITECTURE §16.2); both are fire-and-forget.

// When the Checkout Session (Stripe) or hosted checkout (Waffo) has been created.
export function trackCheckoutStart(userId: string, props: EventProps<'checkout_start'>): void {
  track('checkout_start', props, { distinctId: userId })
}

// After the webhook has credited the purchase (apply_purchase applied: true), never on a replay.
export function trackPurchase(userId: string, props: EventProps<'purchase'>): void {
  track('purchase', props, { distinctId: userId })
}
