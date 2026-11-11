import 'server-only'

import type { SiteConfig } from '../config'
import { AppError } from '../errors'
import { cachedSystemSettings } from '../system-settings/read'
import { decideGallery } from './switch'

export { GALLERY_CACHE_TAG } from './cache'
export { publicCopy, publicCopyText, type PublicCopy } from './public-copy'
export { siteHasGallery } from './switch'

// The one place that decides whether the public gallery is open (ARCHITECTURE §9 第 1 条): its
// routes, the sitemap, the nav and every link to it ask here. The site is passed in because core
// never imports site/. The admin switch is read from the system-settings cache.
export function isGalleryEnabled(site: SiteConfig): Promise<boolean> {
  return decideGallery(site, cachedSystemSettings)
}

// For API routes and server actions: a closed gallery answers 404 like a missing route.
export async function assertGalleryEnabled(site: SiteConfig): Promise<void> {
  if (!(await isGalleryEnabled(site))) throw new AppError('NOT_FOUND', 'Not found')
}
