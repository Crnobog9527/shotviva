import type { Metadata } from 'next'

import type { ModuleId, SiteConfig } from '../config'
import { DEFAULT_LOCALE, hreflang, type Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { INDEX, NOINDEX, hasTranslation, isIndexableIn } from './indexing'
import { absoluteUrl, siteOrigin } from './site-url'
import { startupImages } from './startup-images'
import { MANIFEST_PATHS } from './web-manifest'

// " | Shotviva"
export function brandSuffix(site: SiteConfig): string {
  return ` | ${site.brand.name}`
}

// Root default: nothing is indexable unless a page opts in through pageMetadata.
export function rootMetadata(site: SiteConfig, locale: Locale = DEFAULT_LOCALE): Metadata {
  return {
    metadataBase: new URL(siteOrigin(site)),
    // Every page below the home page ends its Title with " | Shotviva" (建站规格 §1). Pages that
    // set a plain title (app, sign-in, 404) get it from this template; SEO pages set the whole
    // title themselves through pageMetadata.
    title: { default: site.brand.name, template: `%s${brandSuffix(site)}` },
    applicationName: site.brand.name,
    // Home-screen shortcut name (Owner 2026-11-07): iOS "Add to Home Screen" reads
    // apple-mobile-web-app-title, Chrome on Android the manifest name (app/manifest.ts); both are
    // the brand, never the long SEO title. capable: false keeps it opening in the browser, like the
    // manifest's display: browser, so OAuth and hosted checkout redirects are never stranded.
    // startupImage (T65): opened from the home screen as a web app, iOS shows the "S." on the
    // darkroom ground instead of a black screen while the page loads.
    appleWebApp: { title: site.brand.name, capable: false, startupImage: startupImages() },
    // Per language (T65): a /zh page added to the home screen starts at /zh.
    manifest: MANIFEST_PATHS[locale],
    robots: NOINDEX,
  }
}

// Logged-in app shell, admin, account: always out of search (建站规格 R6).
export function appShellMetadata(): Metadata {
  return { robots: NOINDEX }
}

export type PageMetaInput = { path: string; title: string; description: string; module?: ModuleId }

// hreflang en / zh-Hans / x-default (→ English) only where both versions exist
// (建站规格 §6.1 rule 4); English-only pages carry no alternates at all.
// hreflang only between pages indexable in both languages (ARCHITECTURE §17): a noindex /zh page
// (every SEO inner page but the generator, the app pages) gets none, though the language
// switch still points at it.
function languageAlternates(site: SiteConfig, input: PageMetaInput): Record<string, string> | undefined {
  if (!hasTranslation(site, input.path, [input])) return undefined
  if (!site.indexing.zhIndexablePaths.includes(input.path as `/${string}`)) return undefined
  const english = absoluteUrl(site, input.path)
  return {
    [hreflang('en')]: english,
    [hreflang('zh')]: absoluteUrl(site, localizePath(input.path, 'zh')),
    'x-default': english,
  }
}

// `path` is the logical path; the canonical is the page's own address in `locale` (a /zh page
// never canonicalises to its English twin, 建站规格 §6.1 rule 4).
export function pageMetadata(site: SiteConfig, input: PageMetaInput, locale: Locale = DEFAULT_LOCALE): Metadata {
  const url = absoluteUrl(site, localizePath(input.path, locale))
  return {
    title: { absolute: input.title },
    description: input.description,
    alternates: { canonical: url, languages: languageAlternates(site, input) },
    robots: isIndexableIn(site, locale, input.path, [input]) ? INDEX : NOINDEX,
    openGraph: {
      type: 'website',
      siteName: site.brand.name,
      title: input.title,
      description: input.description,
      url,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
    twitter: { card: 'summary_large_image', title: input.title, description: input.description },
  }
}
