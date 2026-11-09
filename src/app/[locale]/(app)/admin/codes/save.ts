import 'server-only'

import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { saveCode } from '@/core/codes/server'
import { site } from '@/site/site.config'

// Called by the admin workflow after it provisions any Stripe coupon. Catalog and actor
// always come from the server, including for edits that only change a note or expiry date.
export async function saveCampaignCode(codeId: string, fields: unknown) {
  const actor = await requireAdmin()
  return saveCode(createAdminSupabase(), actor.id, codeId, fields, site.billing.products)
}
