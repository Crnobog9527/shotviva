// Stripe Checkout and its webhook (T9, ARCHITECTURE §6.3). Routes in app/ wire these with the
// site's products; core never imports site.
export {
  CHECKOUT_METHODS,
  STRIPE_TAX_CODE,
  checkoutRoute,
  desiredPrices,
  lookupKey,
  offeredMethods,
  priceCents,
  stripeProductId,
  stripeProductName,
  type CheckoutForm,
  type CheckoutMethod,
  type CheckoutRoute,
  type DesiredPrice,
} from './catalog'
export {
  assertOffered,
  CHECKOUT_LOCALES,
  CHECKOUT_RETURN,
  checkoutBodySchema,
  createCheckout,
  successPath,
  type CheckoutBody,
  type CheckoutDeps,
} from './checkout'
export { managedPaymentsEnabled, stripeClient, stripeWebhookSecret, type StripeApi } from './client'
export { fulfilCheckoutSession, type FulfilDeps, type FulfilOutcome } from './fulfil'
export { handleStripeWebhook, type WebhookDeps, type WebhookResult } from './webhook'
export { applyReplay, previewReplay, REPLAY_ERRORS, type ReplayOutcome, type ReplayPreview } from './replay'
