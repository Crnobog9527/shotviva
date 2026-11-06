import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { SiteFooter } from '@/core/content'
import { currentLocale } from '@/core/i18n/server'
import { FooterLocales, FooterLocalesFallback, Link, LocaleMenu, SwitchBanner } from '@/core/i18n/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

import './marketing.css'

const zhPaths = site.locales.zhPaths

// Marketing shell (DESIGN §6.9 items 4–5, design/comps-v3-b/home.html): wordmark, then
// Templates (the home template section; v1 has no /templates page) · Pricing · the globe ·
// Log in · Start free; phones keep the globe and Log in. Footer: contact, copyright, legal links
// and the text language switch (ARCHITECTURE §17).
export default async function MarketingLayout({ children }: LayoutProps<'/[locale]'>) {
  const locale = await currentLocale()
  const t = await getTranslations('marketing.nav')
  return (
    <>
      <Suspense fallback={null}>
        <SwitchBanner translatedPaths={zhPaths} />
      </Suspense>
      <AnnouncementBanner />
      <header className="mk-appbar">
        <div className="mk-w mk-appbar-row">
          <Link href="/" className="mk-brand" aria-label={`${site.brand.name}, ${t('tagline')}`}>
            <span className="mk-word">
              {site.brand.name}
              <i>.</i>
            </span>
            <span className="mk-brand-tag">{t('tagline')}</span>
          </Link>
          <nav aria-label={t('label')} className="mk-nav">
            <Link href="/#templates" className="mk-nl">
              {t('templates')}
            </Link>
            <Link href="/pricing" className="mk-nl">
              {t('pricing')}
            </Link>
            {/* usePathname() is request data on dynamic routes; nothing shows until it resolves. */}
            <Suspense fallback={<span className="size-11" />}>
              <LocaleMenu translatedPaths={zhPaths} />
            </Suspense>
            <Link href="/login" className="mk-ghost-pill mk-login">
              {t('login')}
            </Link>
            <Link href="/signup" className="mk-start">
              {t('startFree')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter
        brand={site.brand}
        links={footerLinksIn(locale)}
        languageSwitch={
          <Suspense fallback={<FooterLocalesFallback />}>
            <FooterLocales translatedPaths={zhPaths} />
          </Suspense>
        }
      />
    </>
  )
}
