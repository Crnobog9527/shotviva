import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { requireUser } from '@/core/auth'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

export const metadata: Metadata = { title: 'Wishlist' }

// Placeholder tab root; T12 builds the wall here. 404 while the feature is off (ARCHITECTURE
// §15.6), so the route never exists without its tab.
async function Wishlist() {
  await requireUser('/wishlist')
  return <p className="px-4 pt-4 text-body text-bone-dim">Template requests open here soon.</p>
}

export default function WishlistPage() {
  if (!isWishlistEnabled(site)) notFound()
  return (
    <AppPage>
      <TabRootHeader title="Wishlist" />
      <Suspense>
        <Wishlist />
      </Suspense>
    </AppPage>
  )
}
