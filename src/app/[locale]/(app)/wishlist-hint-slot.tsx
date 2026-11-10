import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { getSessionUser } from '@/core/auth'
import { logger } from '@/core/logger'
import { isWishlistEnabled } from '@/core/wishlist'
import { WishlistHint } from '@/core/wishlist/ui'
import { AfterSuccess } from '@/modules/image'
import { site } from '@/site/site.config'

import { markWishlistHintSeen } from './wishlist/onboarding-actions'

// Whether this account still has the "you can request templates now" hint to see: the wishlist
// open (cached) and onboarding.wishlistHintSeen unset (the session the shell already reads).
async function due(): Promise<boolean> {
  try {
    const [open, user] = await Promise.all([isWishlistEnabled(site), getSessionUser()])
    return open && user !== null && !user.onboarding.wishlistHintSeen
  } catch (error) {
    unstable_rethrow(error)
    logger.warn('wishlist.hint_read_failed', { error })
    return false
  }
}

// The hint itself comes up once a photo has come out in this tab (AfterSuccess).
async function Resolved() {
  if (!(await due())) return null
  return (
    <AfterSuccess>
      <WishlistHint markSeen={markWishlistHintSeen} />
    </AfterSuccess>
  )
}

// Its own Suspense hole: the shell never waits for the session.
export function WishlistHintSlot() {
  return (
    <Suspense fallback={null}>
      <Resolved />
    </Suspense>
  )
}
