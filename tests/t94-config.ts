// Test-only access to the same product config the app injects into core.
import { site } from '@/site/site.config'

export const invite = site.growth.invite
export const benefits = { freeCredits: site.billing.freeCredits, invite }
export const pack = site.billing.products.find(product => product.id === 'pack_s')!
