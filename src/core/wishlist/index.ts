import type { SiteConfig } from '../config'

// The one place that decides whether the wishlist exists (ARCHITECTURE §15.6): the tab bar,
// its routes and the admin nav all ask here. The site is passed in because core never imports
// site/. T12 builds the rest of core/wishlist next to this.
export function isWishlistEnabled(site: SiteConfig): boolean {
  return site.features.wishlist
}
