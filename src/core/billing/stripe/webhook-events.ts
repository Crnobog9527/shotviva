// The events the Stripe webhook endpoint must be subscribed to (ARCHITECTURE §6.3). The handler
// table in webhook.ts is typed by this list, and scripts/stripe-setup.ts checks the account's
// endpoints against it, so a new event (T71: charge.dispute.closed) cannot be handled in code yet
// missing in Stripe unnoticed. Pure: the setup script imports it outside Next.
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const

export type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number]

// Events an endpoint should receive but does not ('*' receives everything).
export function missingWebhookEvents(enabled: readonly string[]): StripeWebhookEvent[] {
  if (enabled.includes('*')) return []
  return STRIPE_WEBHOOK_EVENTS.filter((event) => !enabled.includes(event))
}
