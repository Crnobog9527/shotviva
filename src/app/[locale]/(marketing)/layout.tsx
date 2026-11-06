import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { SiteFooter } from '@/core/content'
import { currentLocale } from '@/core/i18n/server'
import { Link, LocaleMenu, LocaleSwitcher, LocaleSwitcherFallback, SwitchBanner } from '@/core/i18n/ui'
import { countriesIn, footerLinksIn } from '@/site/content'
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
// Language: the globe menu in the top nav after Pricing, visible on phones too, and the text
// switch in the footer (DESIGN §6.9 item 4, ARCHITECTURE §17).
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await currentLocale()
  const t = await getTranslations('marketing.nav')
  return (
    <>
      <Suspense fallback={null}>
        <SwitchBanner translatedPaths={zhPaths} />
      </Suspense>
      <AnnouncementBanner />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 p-4">
        <Link href="/">
          {site.brand.name} <span>{t('tagline')}</span>
        </Link>
        <nav aria-label={t('label')} className="flex items-center gap-2">
          <Link href="/pricing" className="inline-flex min-h-11 items-center px-2">
            {t('pricing')}
          </Link>
          {/* usePathname() is request data on dynamic routes; nothing shows until it resolves. */}
          <Suspense fallback={<span className="size-11" />}>
            <LocaleMenu translatedPaths={zhPaths} />
          </Suspense>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter
        brand={{ ...site.brand, tagline: t('tagline') }}
        links={footerLinksIn(locale)}
        countries={countriesIn(locale)}
        languageSwitch={<Switcher />}
      />
    </>
  )
}
