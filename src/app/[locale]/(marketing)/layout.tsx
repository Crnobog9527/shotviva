import { Suspense } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { SiteFooter } from '@/core/content'
import { Link, LocaleSwitcher, LocaleSwitcherFallback, SwitchBanner } from '@/core/i18n/ui'
import { footerLinks } from '@/site/content'
import { site } from '@/site/site.config'

const zhPaths = site.locales.zhPaths

// usePathname() is request data on dynamic routes; the fallback still links to the other home.
function Switcher({ className }: { className?: string }) {
  return (
    <Suspense fallback={<LocaleSwitcherFallback className={className} />}>
      <LocaleSwitcher translatedPaths={zhPaths} className={className} />
    </Suspense>
  )
}

// Placeholder marketing shell (T6 designs it): nav + content + footer (ARCHITECTURE §1).
// The language switch sits in the header and the footer (ARCHITECTURE §17).
export default function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  return (
    <>
      <Suspense fallback={null}>
        <SwitchBanner translatedPaths={zhPaths} />
      </Suspense>
      <AnnouncementBanner />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
        <Link href="/">
          {site.brand.name} <span>{site.brand.tagline}</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link href="/pricing">Pricing</Link>
          <Switcher />
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter brand={site.brand} links={footerLinks} languageSwitch={<Switcher />} />
    </>
  )
}
