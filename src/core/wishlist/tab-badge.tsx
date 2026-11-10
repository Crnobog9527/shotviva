import 'server-only'

import { getTranslations } from 'next-intl/server'
import { unstable_rethrow } from 'next/navigation'

import { getSessionUser } from '../auth'
import { logger } from '../logger'
import { WishlistTabDot } from './ui/tab-dot'

// The Wishlist tab's first-run dot, rendered by the app layout in its own Suspense hole (it
// reads the session). Signed out, already seen, or a failed read: no dot.
export async function WishlistTabBadge() {
  try {
    const user = await getSessionUser()
    if (!user || user.onboarding.wishlistSeen) return null
  } catch (error) {
    unstable_rethrow(error)
    logger.warn('wishlist.tab_dot_failed', { error })
    return null
  }
  const t = await getTranslations('app.wishlist')
  return <WishlistTabDot label={t('tabDot')} />
}
