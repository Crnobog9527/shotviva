import type { SiteConfig } from '../config'
import { serverEnv } from '../env'
import { AppError } from '../errors'
import { cachedSystemSettings } from '../system-settings/read'
import { decideWishlist } from './switch'

export { previewOverride, siteHasWishlist } from './switch'

// The one place that decides whether the wishlist is open (ARCHITECTURE §15.6): the tab bar,
// its routes, the paywall perk and the admin nav all ask here. The site is passed in because
// core never imports site/. The admin switch is read from the system-settings cache.
export function isWishlistEnabled(site: SiteConfig): Promise<boolean> {
  return decideWishlist(site, serverEnv(), cachedSystemSettings)
}

// For API routes and server actions: a switched-off wishlist answers 404 like a missing route.
export async function assertWishlistEnabled(site: SiteConfig): Promise<void> {
  if (!(await isWishlistEnabled(site))) throw new AppError('NOT_FOUND', 'Not found')
}

export { DESCRIPTION_MAX, IMAGES_MAX, IMAGES_MIN } from './rules'
export { REQUEST_STATUSES } from './types'
export type { AdminRequest, MyRequest, Page, RequestStatus, ReviewAction, VoteResult, WallCard } from './types'
export { PAGE_SIZE } from './cursor'
export type { ReviewInput } from './schema'

// Server-side (service-role writes, RLS reads, R2). Client components use '@/core/wishlist/rules'.
export { listAdminRequests, listTemplateOptions, reviewRequest } from './admin'
export { createRequest, isWishlistEligible, toggleVote, type WishlistDeps } from './requests'
export { listMyRequests, listWall } from './wall'
// First-run guidance (Owner 2026-11-10): the tab's dot, read from the session.
export { WishlistTabBadge } from './tab-badge'
export { listMyWishNotices, markWishNoticesSeen, WISH_NOTICES_TAG, type WishNotice } from './notices'
export { toNoticeItems, type NoticeItem } from './notice-items'
