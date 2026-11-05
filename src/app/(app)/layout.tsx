import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AnalyticsIdentify } from '@/core/analytics/browser'
import { AppFrame, TabBar, type TabItem } from '@/core/app-shell'
import { getSessionUser } from '@/core/auth'
import { isModuleEnabled } from '@/core/config'
import { appShellMetadata } from '@/core/seo'
import { isWishlistEnabled } from '@/core/wishlist'
import { GenerationRunner, PhotosTabBadge } from '@/modules/image'
import { site } from '@/site/site.config'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell (DESIGN §8): tab bar on tab roots, generation that outlives the workspace.
// Every page inside still calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

// Same cached session lookup the page's requireUser() makes, so no extra auth round trip.
async function Identity() {
  const user = await getSessionUser()
  return user ? <AnalyticsIdentify userId={user.id} /> : null
}

function tabs(): TabItem[] {
  const image = isModuleEnabled(site, 'image')
  return [
    ...(image ? [{ href: '/generate', label: 'Create', icon: 'create' } as const] : []),
    ...(isWishlistEnabled(site) ? [{ href: '/wishlist', label: 'Wishlist', icon: 'wishlist' } as const] : []),
    ...(image ? [{ href: '/photos', label: 'Photos', icon: 'photos', badge: <PhotosTabBadge /> } as const] : []),
    { href: '/account', label: 'Account', icon: 'account' },
  ]
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <AppFrame>
      <Suspense fallback={null}>
        <Identity />
      </Suspense>
      {/* usePathname decides tab root vs flow page; on dynamic routes that is request data. */}
      <Suspense fallback={null}>
        <TabBar items={tabs()} brand={site.brand.name} />
      </Suspense>
      <main className="flex flex-1 flex-col">{children}</main>
      <GenerationRunner />
    </AppFrame>
  )
}
