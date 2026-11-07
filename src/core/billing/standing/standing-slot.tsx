import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { getSessionUser } from '../../auth/session'
import { createAdminSupabase } from '../../auth/supabase-admin'
import { logger } from '../../logger'
import { StandingFeed } from '../paywall/standing-context'
import { readStanding } from '../subscription/guard'
import type { MemberStanding } from '../subscription/standing'

// The request-time hole that tells the paywall what the buyer holds (T66). Placed inside a
// PaywallProvider; the page around it stays prerendered. Its own entry, apart from
// core/billing/subscription: that barrel carries the account page's Plan card and its client
// pieces (the Waffo cancel sheet), which must not ride into the marketing pages' first load. Signed out, unverified, or a failed
// read: nothing is sent, the cards read as for a new buyer, and checkout still refuses (409).
async function standingOf(): Promise<MemberStanding | null> {
  try {
    const user = await getSessionUser()
    if (!user?.verified) return null
    return await readStanding(createAdminSupabase(), user.id)
  } catch (error) {
    // Next's own control flow (prerender bail-outs, redirects) must pass through.
    unstable_rethrow(error)
    logger.error('paywall.standing_read_failed', { error })
    return null
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
