import { notFound } from 'next/navigation'

import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

// Every wishlist page 404s while the feature is off (ARCHITECTURE §15.6), so none of them
// exists without its tab.
export default function WishlistLayout({ children }: LayoutProps<'/wishlist'>) {
  if (!isWishlistEnabled(site)) notFound()
  return children
}
