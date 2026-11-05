import { AppError } from '../errors'
import type { SiteConfig } from '../config'

// The one place that decides whether the wishlist exists (ARCHITECTURE §15.6): the tab bar,
// its routes and the admin nav all ask here. The site is passed in because core never imports
// site/.
export function isWishlistEnabled(site: SiteConfig): boolean {
  return site.features.wishlist
}

// For API routes and server actions: a switched-off wishlist answers 404 like a missing route.
export function assertWishlistEnabled(site: SiteConfig): void {
  if (!isWishlistEnabled(site)) throw new AppError('NOT_FOUND', 'Not found')
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
