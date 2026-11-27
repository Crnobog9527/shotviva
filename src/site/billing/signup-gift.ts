import 'server-only'

import { signupGiftCredits } from '@/core/system-settings'

import { site } from '../site.config'

// The signup gift's amount for every page, metadata and component that states it (2008). With the
// v2 catalogue it is the admin's setting (system_settings signup_gift_credits, cached; the admin
// save expires the cache); without it (a local server) it is the old 6, as signup_gift_amount
// grants. The grant itself never reads this: SQL takes the amount when it pays.
export async function signupGiftCreditsForSite(read: () => Promise<number> = signupGiftCredits): Promise<number> {
  return site.billing.pricingVersion ? read() : site.billing.freeCredits
}
