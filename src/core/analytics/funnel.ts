import 'server-only'

import type { Locale } from '../i18n/locales'
import type { EventProps } from './events'
import { track } from './server-track'

// Typed entry points for T9 (checkout and payment webhooks). Both are server events so an
// ad blocker cannot drop them (ARCHITECTURE §16.2); both are fire-and-forget.

// When the Checkout Session (Stripe) or hosted checkout (Waffo) has been created.
export function trackCheckoutStart(userId: string, props: EventProps<'checkout_start'>, locale: Locale): void {
  track('checkout_start', props, { distinctId: userId, locale })
}

// Back from the hosted checkout without paying (Stripe's cancel_url, T74).
export function trackCheckoutCancel(userId: string, props: EventProps<'checkout_cancel'>, locale: Locale): void {
  track('checkout_cancel', props, { distinctId: userId, locale })
}

// After the webhook has credited the purchase (apply_purchase applied: true), never on a replay.
export function trackPurchase(userId: string, props: EventProps<'purchase'>, locale: Locale): void {
  track('purchase', props, { distinctId: userId, locale })
}
