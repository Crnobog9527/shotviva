// The paywall drawer and its pieces (T9 PR 2, DESIGN §4.5). Client components; products are
// passed in by app/ from site.config.
export { discountTerm, methodLabel, methodNote, planFinePrint, pricingMethodNote, type PaywallMessage } from './copy'
export { PaywallButton } from './paywall-button'
export { PricingPlans } from './pricing-plans'
export { PaywallProvider, usePaywall, type PaywallTrigger } from './paywall-context'
export { packOffers, perCreditUsd, perMonthUsd, tierOffers, yearlySavingPct, yearlySavingUsd, type Period, type TierOffer } from './offer'
export { PricingPayWith } from './pricing-pay-with'
export { tierPerks } from './perks'
export { NO_PERK_FACTS, type PerkFacts } from './perk-facts'
export { BillingToggle } from './billing-toggle'
export { TierCard } from './tier-card'
export { CheckoutCancelToast } from './cancel-toast'
