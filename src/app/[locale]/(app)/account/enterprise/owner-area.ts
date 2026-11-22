import 'server-only'

import { notFound } from 'next/navigation'
import { cache } from 'react'

import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { readOrgView } from '@/core/org/console'

// The signed-in account's place in an org for /account/enterprise: the owner's workspace or a
// member's own org page (Owner 2026-11-23). Anyone outside an org gets the plain 404. Cached per
// request, so the page title and the page share one read.
export const readEnterpriseArea = cache(async (path: string) => {
  const user = await requireUser(path)
  const db = createAdminSupabase()
  const [view, affiliateOn] = await Promise.all([readOrgView(user.id, { db, maskPhone }), isAffiliateEnabled()])
  if (view.kind === 'none') notFound()
  if (view.kind === 'member') return { kind: 'member' as const, user, db, view }
  return { kind: 'owner' as const, user, db, view, affiliate: view.org.affiliateEnabled && affiliateOn }
})

// The signed-in owner's org for an owner-only page of the enterprise area, and whether its 企业联盟
// section exists (the program is on and the org's affiliate switch too). A member or anyone else
// gets the plain 404 (a member's own org page is /account/enterprise).
export async function readOwnerArea(path: string) {
  const area = await readEnterpriseArea(path)
  if (area.kind !== 'owner') notFound()
  return area
}
