'use server'

import { z } from 'zod'

import { AppError } from '@/core/errors'
import { markWishNoticesSeen } from '@/core/wishlist'
import { site } from '@/site/site.config'

// The banner shows at most the five unread notices list_my_wish_notices returns.
const shownIds = z.array(z.string()).max(5)

// "Your wish came true" notices, marked seen as the banner shows them (ARCHITECTURE §15.4).
// Server actions are public endpoints: the browser only says which notices it showed. Whose
// they are always comes from the session, inside markWishNoticesSeen, which also does nothing
// while the wishlist is off or for a signed-out caller, and expires that account's cache.
export async function markWishNoticesSeenAction(requestIds: string[]): Promise<void> {
  const ids = shownIds.safeParse(requestIds)
  if (!ids.success) throw new AppError('INVALID_INPUT', 'Invalid wishlist request IDs')
  await markWishNoticesSeen(site, ids.data)
}
