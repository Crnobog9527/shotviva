import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { SiteFooter } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { FooterLocales, FooterLocalesFallback, Link, LocaleMenu } from '@/core/i18n/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

import './(marketing)/marketing.css'

const zhPaths = site.locales.zhPaths

// The marketing top bar (DESIGN §6.9 item 4, design/comps-v3-b/home.html): wordmark, then
// Templates (the home template section; v1 has no /templates page) · Pricing · the globe ·
// Log in · Start free; phones keep the globe and Log in. Shared by the marketing layout and
// the 404 pages, which render outside it. `locale` is explicit for the global 404.
export async function MarketingHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'marketing.nav' })
  return (
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
  )
}

// Footer: contact, copyright, legal links and the text language switch (ARCHITECTURE §17).
export function MarketingFooter({ locale }: { locale: Locale }) {
  return (
    <SiteFooter
      brand={site.brand}
      links={footerLinksIn(locale)}
      languageSwitch={
        <Suspense fallback={<FooterLocalesFallback />}>
          <FooterLocales translatedPaths={zhPaths} />
        </Suspense>
      }
    />
  )
}
