// The app's Tailwind sheet (utilities for all of src/), first so its layers and tokens precede
// every component sheet. Marketing and sign-in pages load globals-public.css instead.
import '../../globals.css'

import type { Metadata } from 'next'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { isStaffAccount } from '@/core/analytics'
import { AnalyticsIdentify } from '@/core/analytics/browser'
import { WebVitalsSlot } from '@/core/analytics/vitals'
import { AnnouncementBanner } from '@/core/announcements'
import { AdminLink, adminEntryFor, AppFrame, BrandProvider, TabBar, TabBarSlot, type TabItem } from '@/core/app-shell'
import { getSessionUser } from '@/core/auth'
import { clientMessages } from '@/core/i18n'
import { PaywallProvider } from '@/core/billing/paywall'
import { walletOffersWechat } from '@/core/billing/wallet'
import { StandingSlot } from '@/core/billing/standing'
import { paymentChannel } from '@/core/billing/waffo'
import { isModuleEnabled } from '@/core/config'
import { appShellMetadata } from '@/core/seo'
import { SupportTabBadge } from '@/core/support'
import { LivingBackground } from '@/core/ui/living-background'
import { isWishlistEnabled, WishlistTabBadge } from '@/core/wishlist'
import { GenerationOwner, GenerationRunner, HideWhileGenerating, PhotosTabBadge } from '@/modules/image/app-shell'
import { displayProducts } from '@/site/billing/display-products'
import { site } from '@/site/site.config'

import { paywallPerkFacts } from '../paywall-perk-facts'
import { WishNoticeSlot } from './wish-notice-slot'
import { WishlistHintSlot } from './wishlist-hint-slot'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell (DESIGN §8): tab bar on tab roots (and under the Photos viewer, /photos/<id>),
// generation that outlives the workspace.
// Every page inside still calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

// No `prefetch = 'partial'` here (it was on from #236 to 2026-11-28). With it, Next renders every app
// page a second time after the first and puts that copy inside the same response, for its client
// cache (app-render.js, prefetchMode 2; there is no switch for the embedding alone). Each document
// and each refresh then carried the page's flight data twice, and with it the inlined stylesheet
// (about 200 KB) and the message catalogue (about 66 KB) once more: /zh/photos 1067 KB instead of
// 774 KB (gzip 223 vs 144 KB), the first picture's markup at byte 936 KB instead of 652 KB, and on
// slow 4G the document 1.1 s later. It bought nothing in return: every session read here sits
// behind connection(), which a runtime prefetch leaves out, so a prefetched tab opened in the same
// time with it and without it (taps to 作品 / 我的 / 创作 until the page settles, 300 ms latency:
// 569 / 593 / 99 ms with, 670 / 440 / 92 ms without, within run-to-run spread).
// Guarded by app-single-payload.test.ts.

// Same cached session lookup the page's requireUser() makes, so no extra auth round trip.
// The generation store is scoped to the same id: a tab that signs in as someone else drops the
// last account's batch.
async function Identity() {
  const user = await getSessionUser()
  return user ? (
    <>
      <AnalyticsIdentify userId={user.id} staff={isStaffAccount(user, site.brand.domain)} />
      <GenerationOwner userId={user.id} />
    </>
  ) : null
}

// The top bar's Admin item (spec #186), decided here on the server: built only for
// profiles.role = 'admin', so no one else's props or HTML carry it. /admin checks the role itself.
// It streams in on its own, at the bar's right end: the bar must not wait for the session.
async function Admin() {
  const [user, t] = await Promise.all([getSessionUser(), getTranslations('adminEntry')])
  const entry = adminEntryFor(user?.role, () => t('label'))
  return entry ? <AdminLink entry={entry} /> : null
}

// The Wishlist tab is built with the others and dropped here while the wishlist is closed: the
// switch is an admin setting read at runtime (ARCHITECTURE §15.6). That read is cached
// (core/system-settings), so the bar stays in the prerendered shell; the session is read only
// by the Admin item, in its own Suspense.
async function Tabs({ items }: { items: TabItem[] }) {
  const shown = (await isWishlistEnabled(site)) ? items : items.filter((item) => item.href !== '/wishlist')
  const admin = (
    <Suspense fallback={null}>
      <Admin />
    </Suspense>
  )
  // /checkout (the payment return page) wears the shell like a tab root (gap audit C1).
  return <TabBar items={shown} rootsUnder={['/photos/']} shellPages={['/checkout']} admin={admin} />
}

// The paywall lists the wishlist perk only while it is open, and the photo estimate from the
// live catalogue. Both reads are cached, so this stays in the prerendered shell. What the member
// already holds (T66: lower plans locked, higher ones Upgrade) streams in through its own
// Suspense hole.
async function Paywall({ children }: { children: ReactNode }) {
  const [perkFacts, products] = await Promise.all([paywallPerkFacts(), displayProducts()])
  return (
    <PaywallProvider products={products} perkFacts={perkFacts} channel={paymentChannel()} wechatPay={walletOffersWechat()}>
      {children}
      <StandingSlot />
    </PaywallProvider>
  )
}

// The root layout hands public pages only their messages (core/i18n/client-messages.ts); the app
// gets every client namespace here, for its own pages and its chrome.
async function AppMessages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider messages={clientMessages(await getMessages())}>{children}</NextIntlClientProvider>
}

function useTabs(): TabItem[] {
  const t = useTranslations('app.tabs')
  const image = isModuleEnabled(site, 'image')
  return [
    ...(image ? [{ href: '/generate', label: t('create'), icon: 'create' } as const] : []),
    // A dot until the account first opens the wall (onboarding.wishlistSeen, Owner 2026-11-10).
    {
      href: '/wishlist',
      label: t('wishlist'),
      icon: 'wishlist',
      badge: (
        <Suspense fallback={null}>
          <WishlistTabBadge />
        </Suspense>
      ),
    } as const,
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
    <AppMessages>
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
            {/* usePathname decides tab root vs flow page. It is prerendered with every static app page,
                so the bar is there from the first paint; on a dynamic-param page it waits for the
                request, and TabBarSlot holds its room meanwhile. */}
            <Suspense fallback={<TabBarSlot />}>
              <Tabs items={tabs} />
            </Suspense>
            <main className="flex flex-1 flex-col">
              {/* "Your wish came true", for an account with unread notices (ARCHITECTURE §15.4): at the
                  top of the page, in flow, so a notice that stays until closed never covers a control. */}
              <WishNoticeSlot />
              {children}
            </main>
            <GenerationRunner />
            <WishlistHintSlot />
            {/* Anonymous speed numbers (Owner 2026-11-24: numbers only); app tab roots only, never /admin. */}
            <WebVitalsSlot />
          </BrandProvider>
          {/* DESIGN §5 「全站流动背景」 (T54); it renders nothing on /admin. */}
          <LivingBackground />
        </Paywall>
      </AppFrame>
    </AppMessages>
  )
}
