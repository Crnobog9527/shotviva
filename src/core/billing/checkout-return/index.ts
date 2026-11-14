// The checkout return page (T43): /checkout after Stripe or Waffo, with the purchase
// celebration (T55). Server reads in facts.ts; app/ wires the clients. The cancel toast on /pricing lives in
// core/billing/paywall, so /pricing never pulls this folder's client code in.
export { readCheckoutFacts, type CheckoutFacts, type FactsDeps } from './facts'
export { PendingReturn } from './pending-return'
export { partnerParams, readReturnQuery, type ReturnQuery } from './query'
export { SuccessReturn } from './success-return'
export { returnView, type ReturnView } from './view-model'
