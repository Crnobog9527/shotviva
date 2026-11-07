import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AnalyticsIdentify } from '@/core/analytics/browser'
import { AnnouncementBanner } from '@/core/announcements'
import { adminEntryFor, AppFrame, BrandProvider, TabBar, type AdminEntry, type TabItem } from '@/core/app-shell'
import { getSessionUser } from '@/core/auth'
import { PaywallProvider } from '@/core/billing/paywall'
import { paymentChannel } from '@/core/billing/waffo'
import { isModuleEnabled } from '@/core/config'
import { appShellMetadata } from '@/core/seo'
import { SupportTabBadge } from '@/core/support'
import { LivingBackground } from '@/core/ui/living-background'
import { isWishlistEnabled } from '@/core/wishlist'
import { GenerationRunner, HideWhileGenerating, PhotosTabBadge } from '@/modules/image'
import { site } from '@/site/site.config'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell (DESIGN §8): tab bar on tab roots (and over the photo page from md up, T38),
// generation that outlives the workspace.
// Every page inside still calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

// Partial Prefetching for the app only (next.config.ts keeps it off for marketing pages).
export const prefetch = 'partial'

// Same cached session lookup the page's requireUser() makes, so no extra auth round trip.
async function Identity() {
  const user = await getSessionUser()
  return user ? <AnalyticsIdentify userId={user.id} /> : null
}

// The top bar's Admin item (spec #186), decided here on the server: built only for
// profiles.role = 'admin', so no one else's props or HTML carry it. /admin checks the role itself.
async function adminEntry(): Promise<AdminEntry | undefined> {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations('adminEntry')])
  return adminEntryFor(user?.role, () => t('label'))
}

// The Wishlist tab is built with the others and dropped here while the wishlist is closed: the
// switch is an admin setting read at runtime (ARCHITECTURE §15.6), and this part streams anyway.
async function Tabs({ items }: { items: TabItem[] }) {
  const [admin, wishlist] = await Promise.all([adminEntry(), isWishlistEnabled(site)])
  const shown = wishlist ? items : items.filter((item) => item.href !== '/wishlist')
  return <TabBar items={shown} desktopUnder={['/photos/']} admin={admin} />
}

// The paywall lists the wishlist perk only while it is open. The switch read is cached
// (core/system-settings), so this stays in the prerendered shell.
async function Paywall({ children }: { children: ReactNode }) {
  const wishlistLive = await isWishlistEnabled(site)
  return (
    <PaywallProvider products={site.billing.products} wishlistLive={wishlistLive} channel={paymentChannel()}>
      {children}
    </PaywallProvider>
  )
}

function useTabs(): TabItem[] {
  const t = useTranslations('app.tabs')
  const image = isModuleEnabled(site, 'image')
  return [
    ...(image ? [{ href: '/generate', label: t('create'), icon: 'create' } as const] : []),
    { href: '/wishlist', label: t('wishlist'), icon: 'wishlist' } as const,
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
      <Paywall>
        {/* The wordmark in the top bar and the phone tab-root headers reads the brand from here. */}
        <BrandProvider name={site.brand.name}>
          <Suspense fallback={null}>
            <Identity />
          </Suspense>
          {/* usePathname decides tab root vs flow page; on dynamic routes that is request data. */}
          <Suspense fallback={null}>
            <Tabs items={tabs} />
          </Suspense>
          <main className="flex flex-1 flex-col">{children}</main>
          <GenerationRunner />
        </BrandProvider>
        {/* DESIGN §5 「全站流动背景」 (T54); it renders nothing on /admin. */}
        <LivingBackground />
      </Paywall>
    </AppFrame>
  )
}
