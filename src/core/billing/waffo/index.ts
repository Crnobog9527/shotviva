// Waffo hosted checkout, the one-time fallback channel (T13, ARCHITECTURE §6.3). Routes in app/
// wire these with the site's products; core never imports site.
export { WAFFO_SESSION_TTL_SECONDS, createWaffoCheckout, waffoSessionRequest, type WaffoCheckoutDeps } from './checkout'
export { WAFFO_API_ORIGIN, signWaffoRequest, waffoClient, type WaffoApi, type WaffoSessionRequest } from './client'
export {
  normalizePem,
  paymentChannel,
  waffoConfig,
  waffoWebhookConfig,
  type WaffoConfig,
  type WaffoMode,
  type WaffoWebhookConfig,
} from './config'
export { fulfilWaffoOrder, settleWaffoOrder, type WaffoFulfilDeps, type WaffoFulfilOutcome } from './fulfil'
export { chargedMethod, paymentFacts, readWaffoOrder, toCents, type WaffoOrder, type WaffoPaymentFacts } from './payment-facts'
export {
  WAFFO_SIGNATURE_WINDOW_MS,
  handleWaffoWebhook,
  verifyWaffoEvent,
  type WaffoEvent,
  type WaffoWebhookDeps,
  type WaffoWebhookResult,
} from './webhook'
