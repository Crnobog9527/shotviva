import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AnnouncementBanner } from '@/core/announcements'
import { SiteFooter } from '@/core/content'
import { currentLocale } from '@/core/i18n/server'
import { FooterLocales, FooterLocalesFallback, Link, LocaleMenu, SwitchBanner } from '@/core/i18n/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

import '../(marketing)/marketing.css'
import './auth.css'

const zhPaths = site.locales.zhPaths

// /login · /signup · /reset · /reset/update (design/comps-v3-b/auth.html): the marketing shell,
// trimmed to the wordmark, Pricing and the language globe, so nothing in the bar repeats the
// form (no Log in, no Start free). The form sits on one plate under a safelight; the footer is
// the marketing footer.
export default async function AuthLayout({ children }: LayoutProps<'/[locale]'>) {
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
            <Link href="/pricing" className="au-nl">
              {t('pricing')}
            </Link>
            <Suspense fallback={<span className="size-11" />}>
              <LocaleMenu translatedPaths={zhPaths} />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="au-main">
        <div className="au-plate">{children}</div>
      </main>
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
