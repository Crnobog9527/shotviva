import { getLocale } from 'next-intl/server'
import { unstable_rethrow } from 'next/navigation'
import { Suspense } from 'react'

import { isLocale } from '@/core/i18n'
import { logger } from '@/core/logger'
import { listMyWishNotices, toNoticeItems, type NoticeItem } from '@/core/wishlist'
import { WishNoticeLazy } from '@/core/wishlist/ui/wish-notice-lazy'
import { site } from '@/site/site.config'

import { markWishNoticesSeenAction } from './wishlist/notice-actions'

// The signed-in account's unread "your wish came true" notices (ARCHITECTURE §15.4), cached
// per account and empty while the wishlist is off or nobody is signed in. A failed read only
// means the banner waits for the next visit.
async function unread(): Promise<NoticeItem[]> {
  try {
    const [notices, locale] = await Promise.all([listMyWishNotices(site), getLocale()])
    return toNoticeItems(notices, isLocale(locale) ? locale : 'en')
  } catch (error) {
    unstable_rethrow(error)
    logger.warn('wishlist.notices_read_failed', { error })
    return []
  }
}

async function Resolved() {
  const items = await unread()
  return items.length ? <WishNoticeLazy items={items} markSeen={markWishNoticesSeenAction} /> : null
}

// Its own Suspense hole, like the wishlist hint's: the shell never waits for the session.
export function WishNoticeSlot() {
  return (
    <Suspense fallback={null}>
      <Resolved />
    </Suspense>
  )
}
