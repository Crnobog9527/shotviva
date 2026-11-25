import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { cachedHasPublishedPosts } from '@/core/blog'
import { SiteFooter } from '@/core/content'
import { NavMenu, type NavMenuLink } from '@/core/content/blocks/nav-menu'
import { isGalleryEnabled } from '@/core/gallery'
import { isWishlistEnabled } from '@/core/wishlist'
import type { Locale } from '@/core/i18n'
import { FooterLocales, FooterLocalesFallback, Link, LocaleMenu, NavLink } from '@/core/i18n/ui'
import { footerLinksIn } from '@/site/content'
import { site } from '@/site/site.config'

import { NavAccountSlot } from './nav-account-slot'
import './(marketing)/marketing.css'

const zhPaths = site.locales.zhPaths

type NavText = Awaited<ReturnType<typeof getTranslations<'marketing.nav'>>>

// The Use Cases list, one source for the top bar and the phone row so the two never drift.
function menuLinksOfUseCases(t: NavText, locale: Locale): NavMenuLink[] {
  return [
    { href: '/ai-restaurant-menu', label: t('useCaseMenu') },
    { href: '/commercial-photography', label: t('useCaseCommercial') },
    { href: '/image-to-image-generator', label: t('useCaseGenerator') },
    // English only (04-P1): there is no /zh version of this page.
    ...(locale === 'en' ? [{ href: '/transparent-background' as const, label: t('useCaseTransparent') }] : []),
  ]
}

// The marketing top bar (DESIGN §6.9 item 4, design/comps-v3-b/home.html): wordmark, then
// Use Cases (the three landing pages, SEO launch handbook G5) · Templates (the home template section; v1 has no /templates page) ·
// Request a template (/template-requests, only while the wishlist is open; Owner 2026-11-25) · Pricing · the globe ·
// Log in · Start free (signed in: Open app · account), phones keep the globe and Log in (or
// Open app · account). Shared by the marketing layout and
// the 404 pages, which render outside it. `locale` is explicit for the global 404.
export async function MarketingHeader({ locale, homeOnly = false }: { locale: Locale; homeOnly?: boolean }) {
  const [t, wishlistOpen] = await Promise.all([getTranslations({ locale, namespace: 'marketing.nav' }), isWishlistEnabled(site)])
  return (
    <>
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
            links={menuLinksOfUseCases(t, locale)}
          />
          <Link href="/#templates" className="mk-nl">
            {t('templates')}
          </Link>
          {wishlistOpen ? (
            <Suspense
              fallback={
                <Link href="/template-requests" className="mk-nl mk-nl-wide">
                  {t('requestTemplate')}
                </Link>
              }
            >
              <NavLink href="/template-requests" className="mk-nl mk-nl-wide">
                {t('requestTemplate')}
              </NavLink>
            </Suspense>
          ) : null}
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
            <LocaleMenu translatedPaths={zhPaths} homeOnly={homeOnly} />
          </Suspense>
          <NavAccountSlot />
        </nav>
      </div>
    </header>
    <PhoneNav locale={locale} wishlistOpen={wishlistOpen} />
    </>
  )
}

// Phones (Owner 2026-11-24): the top bar has room for the globe and Log in alone, and the rules
// forbid a hamburger, so the pages sit in one row under it, in the desktop bar's order and with
// its Use Cases list (Owner 2026-11-25): Use Cases ▾ · Templates · Request a template (while the
// wishlist is open) · Pricing. Tablets (768–1023px) keep the row only for what their bar has no
// room for; the rest is hidden there (mk-mnav-dup). Not sticky: it scrolls away with the page.
async function PhoneNav({ locale, wishlistOpen }: { locale: Locale; wishlistOpen: boolean }) {
  const t = await getTranslations({ locale, namespace: 'marketing.nav' })
  // Without Request a template a tablet row has nothing its bar lacks: phones only then (mk-mnav-phone).
  return (
    <nav aria-label={t('phoneLabel')} className={wishlistOpen ? 'mk-mnav mk-w' : 'mk-mnav mk-mnav-phone mk-w'}>
      <NavMenu label={t('useCases')} links={menuLinksOfUseCases(t, locale)} variant="row" className="mk-mnav-dup" />
      <Link href="/#templates" className="mk-mnav-dup">
        {t('templates')}
      </Link>
      {wishlistOpen ? <Link href="/template-requests">{t('requestTemplate')}</Link> : null}
      <Link href="/pricing" className="mk-mnav-dup">
        {t('pricing')}
      </Link>
    </nav>
  )
}

// Footer: contact, copyright, legal links and the text language switch (ARCHITECTURE §17).
export async function MarketingFooter({ locale, homeOnly = false }: { locale: Locale; homeOnly?: boolean }) {
  const [t, footerText, wishlistOpen, galleryText, galleryOpen, blogText, hasBlogPosts] = await Promise.all([
    getTranslations({ locale, namespace: 'affiliate' }),
    getTranslations({ locale, namespace: 'footer' }),
    isWishlistEnabled(site),
    getTranslations({ locale, namespace: 'gallery' }),
    isGalleryEnabled(site),
    getTranslations({ locale, namespace: 'blog' }),
    cachedHasPublishedPosts(locale),
  ])
  // The public gallery's one site-wide entry (ARCHITECTURE §9 第 1 条): only while it is open.
  const legal = galleryOpen ? [{ href: '/gallery' as const, label: galleryText('footerLink') }, ...footerLinksIn(locale)] : footerLinksIn(locale)
  // The blog's one entry (ARCHITECTURE §12.6): only once this language has a published post.
  const withBlog = hasBlogPosts ? [{ href: '/blog' as const, label: blogText('footerLink') }, ...legal] : legal
  // The wishlist's public page (Owner 2026-11-25), first in the run: only while the wishlist is open.
  const links = wishlistOpen ? [{ href: '/template-requests' as const, label: footerText('templateRequests') }, ...withBlog] : withBlog
  return (
    <SiteFooter
      brand={site.brand}
      links={links}
      programLink={{ href: '/partners/join', label: t('programName') }}
      languageSwitch={
        <Suspense fallback={<FooterLocalesFallback />}>
          <FooterLocales translatedPaths={zhPaths} homeOnly={homeOnly} />
        </Suspense>
      }
    />
  )
}
