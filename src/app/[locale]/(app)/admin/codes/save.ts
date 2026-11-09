import 'server-only'

import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { saveCampaignWithCoupon } from '@/core/codes/server'
import { site } from '@/site/site.config'

// The admin workflow provisions coupons on the Stripe account for this deployment. Catalog and actor
// always come from the server, including for edits that only change a note or expiry date.
export async function saveCampaignCode(codeId: string, fields: unknown) {
  const actor = await requireAdmin()
  return saveCampaignWithCoupon(createAdminSupabase(), actor.id, codeId, fields, site.billing.products, () => stripeClient().coupons)
}
