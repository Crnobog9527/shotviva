import type { SiteConfig } from '../config'
import { serverEnv, type ServerEnv } from '../env'
import { AppError } from '../errors'

type SwitchEnv = Pick<ServerEnv, 'VERCEL_ENV' | 'FEATURE_WISHLIST_PREVIEW'>

// The site's switch, or the preview-only override: FEATURE_WISHLIST_PREVIEW=on turns the
// wishlist on for a preview or local deployment so it can be validated before the site
// config enables it. Production never reads the override.
export function wishlistSwitch(site: SiteConfig, env: SwitchEnv): boolean {
  if (site.features.wishlist) return true
  return env.VERCEL_ENV !== 'production' && env.FEATURE_WISHLIST_PREVIEW === 'on'
}

// The one place that decides whether the wishlist exists (ARCHITECTURE §15.6): the tab bar,
// its routes and the admin nav all ask here. The site is passed in because core never imports
// site/.
export function isWishlistEnabled(site: SiteConfig): boolean {
  return wishlistSwitch(site, serverEnv())
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
