import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { getSessionUser } from '../../auth/session'
import { createAdminSupabase } from '../../auth/supabase-admin'
import { logger } from '../../logger'
import { isActiveOrgMember, isActiveOrgOwner } from '../org-member-guard'
import { StandingFeed } from '../paywall/standing-context'
import { readStanding } from '../subscription/guard'
import type { MemberStanding } from '../subscription/standing'

// The request-time hole that tells the paywall what the buyer holds (T66). Placed inside a
// PaywallProvider; the page around it stays prerendered. Its own entry, apart from
// core/billing/subscription: that barrel carries the account page's Plan card and its client
// pieces (the Waffo cancel sheet), which must not ride into the marketing pages' first load. Signed out, unverified, or a failed
// read: nothing is sent, the cards read as for a new buyer, and checkout still refuses (409).
// What `userId` holds, for the paywall. Never throws for the org reads (they fail soft below).
export async function readMemberStanding(userId: string): Promise<MemberStanding> {
  const admin = createAdminSupabase()
  const [standing, orgMember, orgPool] = await Promise.all([readStanding(admin, userId), memberRead(admin, userId), ownerRead(admin, userId)])
  return { ...standing, ...(orgMember ? { orgMember } : {}), ...(orgPool ? { orgPool } : {}) }
}

async function standingOf(): Promise<MemberStanding | null> {
  try {
    const user = await getSessionUser()
    if (!user?.verified) return null
    return await readMemberStanding(user.id)
  } catch (error) {
    // Next's own control flow (prerender bail-outs, redirects) must pass through.
    unstable_rethrow(error)
    logger.error('paywall.standing_read_failed', { error })
    return null
  }
}

// Fail-soft: a failed read leaves the buttons open; the checkout route still refuses.
async function memberRead(admin: ReturnType<typeof createAdminSupabase>, userId: string): Promise<boolean> {
  try {
    return await isActiveOrgMember(admin, userId)
  } catch (error) {
    logger.warn('paywall.org_member_read_failed', { error })
    return false
  }
}

// Fail-soft too: a failed read only drops the "goes to your organisation's pool" note.
async function ownerRead(admin: ReturnType<typeof createAdminSupabase>, userId: string): Promise<boolean> {
  try {
    return await isActiveOrgOwner(admin, userId)
  } catch (error) {
    logger.warn('paywall.org_owner_read_failed', { error })
    return false
  }
}

async function Resolved() {
  const standing = await standingOf()
  return standing ? <StandingFeed standing={standing} /> : null
}

export function StandingSlot() {
  return (
    <Suspense fallback={null}>
      <Resolved />
    </Suspense>
  )
}
