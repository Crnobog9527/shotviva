// Waffo hosted checkout, the fallback channel (T13; card subscriptions T50, ARCHITECTURE §6.3). Routes in app/
// wire these with the site's products; core never imports site.
export { WAFFO_SESSION_TTL_SECONDS, createWaffoCheckout, isRecurring, waffoSessionRequest, type WaffoCheckoutDeps } from './checkout'
export { WAFFO_API_ORIGIN, signWaffoRequest, waffoClient, type WaffoApi, type WaffoCancelResult, type WaffoSessionRequest } from './client'
export {
  normalizePem,
  paymentChannel,
  waffoConfig,
  waffoWebhookConfig,
  type WaffoConfig,
  type WaffoMode,
  type WaffoWebhookConfig,
} from './config'
export { cancelWaffoSubscription, type CancelDeps } from './cancel'
export { fulfilWaffoOrder, settleWaffoOrder, type WaffoChargeForm, type WaffoFulfilDeps, type WaffoFulfilOutcome } from './fulfil'
export { SUBSCRIPTION_STATE_EVENTS, applySubscriptionEvent, isoOf, mirrorState, syncWaffoSubscription, type MirrorState, type WaffoSubscriptionSync } from './subscription-sync'
export { chargedMethod, paymentFacts, readWaffoOrder, toCents, type WaffoOrder, type WaffoPaymentFacts } from './payment-facts'
export {
  WAFFO_SIGNATURE_WINDOW_MS,
  handleWaffoWebhook,
  verifyWaffoEvent,
  type WaffoEvent,
  type WaffoWebhookDeps,
  type WaffoWebhookResult,
} from './webhook'
