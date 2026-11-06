import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { AnalyticsIdentify } from '@/core/analytics/browser'
import { AnnouncementBanner } from '@/core/announcements'
import { AppFrame, TabBar, type TabItem } from '@/core/app-shell'
import { getSessionUser } from '@/core/auth'
import { PaywallProvider } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { isModuleEnabled } from '@/core/config'
import { appShellMetadata } from '@/core/seo'
import { SupportTabBadge } from '@/core/support'
import { isWishlistEnabled } from '@/core/wishlist'
import { GenerationRunner, HideWhileGenerating, PhotosTabBadge } from '@/modules/image'
import { site } from '@/site/site.config'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell (DESIGN §8): tab bar on tab roots (and over the photo page from md up, T38),
// generation that outlives the workspace.
// Every page inside still calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

// Same cached session lookup the page's requireUser() makes, so no extra auth round trip.
async function Identity() {
  const user = await getSessionUser()
  return user ? <AnalyticsIdentify userId={user.id} /> : null
}

function useTabs(): TabItem[] {
  const t = useTranslations('app.tabs')
  const image = isModuleEnabled(site, 'image')
  return [
    ...(image ? [{ href: '/generate', label: t('create'), icon: 'create' } as const] : []),
    ...(isWishlistEnabled(site) ? [{ href: '/wishlist', label: t('wishlist'), icon: 'wishlist' } as const] : []),
    ...(image ? [{ href: '/photos', label: t('photos'), icon: 'photos', badge: <PhotosTabBadge /> } as const] : []),
    // The "new reply" dot, read once per page load (ARCHITECTURE §10 「站内工单」).
    {
      href: '/account',
      label: t('account'),
      icon: 'account',
      badge: (
        <Suspense fallback={null}>
          <SupportTabBadge />
        </Suspense>
      ),
    },
  ]
}

export default function AppLayout({ children }: LayoutProps<'/[locale]'>) {
  const tabs = useTabs()
  return (
    <AppFrame>
      {/* Hidden on /admin by the banner itself, and while a generation runs (ARCHITECTURE §10). */}
      <HideWhileGenerating>
        <AnnouncementBanner />
      </HideWhileGenerating>
      <PaywallProvider products={site.billing.products} wishlistLive={isWishlistEnabled(site)} channel={paymentChannel()}>
        <Suspense fallback={null}>
          <Identity />
        </Suspense>
        {/* usePathname decides tab root vs flow page; on dynamic routes that is request data. */}
        <Suspense fallback={null}>
          <TabBar items={tabs} desktopUnder={['/photos/']} />
        </Suspense>
        <main className="flex flex-1 flex-col">{children}</main>
        <GenerationRunner />
      </PaywallProvider>
    </AppFrame>
  )
}
