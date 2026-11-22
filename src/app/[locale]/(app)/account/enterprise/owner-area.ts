import 'server-only'

import { notFound } from 'next/navigation'

import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { readOrgView } from '@/core/org/console'

// The signed-in owner's org for a page of the enterprise area, and whether its 企业联盟 section
// exists (the program is on and the org's affiliate switch too). A member or anyone else gets the
// plain 404 (their card is on /account).
export async function readOwnerArea(path: string) {
  const user = await requireUser(path)
  const db = createAdminSupabase()
  const [view, affiliateOn] = await Promise.all([readOrgView(user.id, { db, maskPhone }), isAffiliateEnabled()])
  if (view.kind !== 'owner') notFound()
  return { user, db, view, affiliate: view.org.affiliateEnabled && affiliateOn }
}
