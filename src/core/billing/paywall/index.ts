// The paywall drawer and its pieces (T9 PR 2, DESIGN §4.5). Client components; products are
// passed in by app/ from site.config.
export { CheckoutNotice } from './checkout-notice'
export { PaywallButton } from './paywall-button'
export { PricingPlans } from './pricing-plans'
export { PaywallProvider, usePaywall, type PaywallTrigger } from './paywall-context'
export { packOffers, perCreditUsd, perMonthUsd, tierOffers, yearlySavingPct, yearlySavingUsd, type Period, type TierOffer } from './offer'
export { tierPerks } from './perks'
export { BillingToggle } from './billing-toggle'
export { TierCard } from './tier-card'
