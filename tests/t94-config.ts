// Test-only access to the same product config the app injects into core.
import { site } from '@/site/site.config'

// These expected values cover the defaults seeded by migration 0980.
export const seededRewards = { inviteeCredits: 6, inviterCredits: 10 }
export const invite = site.growth.invite
export const benefits = { freeCredits: site.billing.freeCredits, invite }
export const pack = site.billing.products.find(product => product.id === 'pack_s')!
