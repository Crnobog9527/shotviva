import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { SiteFooter } from '@/core/content'
import { NavMenu } from '@/core/content/blocks/nav-menu'
import { isGalleryEnabled } from '@/core/gallery'
import type { Locale } from '@/core/i18n'
import { FooterLocales, FooterLocalesFallback, Link, LocaleMenu, NavLink } from '@/core/i18n/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

import { NavAccountSlot } from './nav-account-slot'
import './(marketing)/marketing.css'

const zhPaths = site.locales.zhPaths

// The marketing top bar (DESIGN §6.9 item 4, design/comps-v3-b/home.html): wordmark, then
// Use Cases (the three landing pages, SEO launch handbook G5) · Templates (the home template section; v1 has no /templates page) · Pricing · the globe ·
// Log in · Start free (signed in: Open app · account), phones keep the globe and Log in (or
// Open app · account). Shared by the marketing layout and
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
          <NavMenu
            label={t('useCases')}
            links={[
              { href: '/ai-restaurant-menu', label: t('useCaseMenu') },
              { href: '/commercial-photography', label: t('useCaseCommercial') },
              { href: '/image-to-image-generator', label: t('useCaseGenerator') },
            ]}
          />
          <Link href="/#templates" className="mk-nl">
            {t('templates')}
          </Link>
          {/* aria-current on /pricing; until the path resolves, the plain link. */}
          <Suspense
            fallback={
              <Link href="/pricing" className="mk-nl">
                {t('pricing')}
              </Link>
            }
          >
            <NavLink href="/pricing" className="mk-nl">
              {t('pricing')}
            </NavLink>
          </Suspense>
          {/* usePathname() is request data on dynamic routes; nothing shows until it resolves. */}
          <Suspense fallback={<span className="size-11" />}>
            <LocaleMenu translatedPaths={zhPaths} />
          </Suspense>
          <NavAccountSlot />
        </nav>
      </div>
    </header>
  )
}

// Footer: contact, copyright, legal links and the text language switch (ARCHITECTURE §17).
export async function MarketingFooter({ locale }: { locale: Locale }) {
  const [t, galleryText, galleryOpen] = await Promise.all([
    getTranslations({ locale, namespace: 'affiliate' }),
    getTranslations({ locale, namespace: 'gallery' }),
    isGalleryEnabled(site),
  ])
  // The public gallery's one site-wide entry (ARCHITECTURE §9 第 1 条): only while it is open.
  const links = galleryOpen ? [{ href: '/gallery' as const, label: galleryText('footerLink') }, ...footerLinksIn(locale)] : footerLinksIn(locale)
  return (
    <SiteFooter
      brand={site.brand}
      links={links}
      programLink={{ href: '/partners/join', label: t('programName') }}
      languageSwitch={
        <Suspense fallback={<FooterLocalesFallback />}>
          <FooterLocales translatedPaths={zhPaths} />
        </Suspense>
      }
    />
  )
}
