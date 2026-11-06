import { DEFAULT_LOCALE, LOCALES, type Locale } from './locales'

// Path helpers for the URL scheme of ARCHITECTURE §17: `/pricing` is English, `/zh/pricing`
// its Chinese version, `/zh` the Chinese home. Slugs stay English in both (建站规格 R4).

const PREFIXED = LOCALES.filter((locale) => locale !== DEFAULT_LOCALE)

export type SplitPath = { locale: Locale; path: `/${string}` }

// `/zh/pricing` → { zh, '/pricing' }; `/zh` → { zh, '/' }; anything else is English as is.
export function splitLocale(pathname: string): SplitPath {
  for (const locale of PREFIXED) {
    if (pathname === `/${locale}`) return { locale, path: '/' }
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) as `/${string}` }
  }
  return { locale: DEFAULT_LOCALE, path: (pathname.startsWith('/') ? pathname : `/${pathname}`) as `/${string}` }
}

export function localeOfPath(pathname: string): Locale {
  return splitLocale(pathname).locale
}

// The logical path in a locale. Query strings and hashes are kept; no trailing slash (R4).
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  if (path === '/') return `/${locale}`
  if (path.startsWith('/?') || path.startsWith('/#')) return `/${locale}${path.slice(1)}`
  return `/${locale}${path}`
}

// `/generate/[templateId]` style patterns, one dynamic segment per bracket pair.
function patternToRegExp(pattern: string): RegExp {
  const source = pattern
    .split('/')
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${source}/?$`)
}

// Whether a logical (unprefixed) path is one of the pages that have a translation.
export function matchesPaths(path: string, patterns: readonly string[]): boolean {
  const bare = path.split(/[?#]/)[0] || '/'
  return patterns.some((pattern) => (pattern === '/' ? bare === '/' : patternToRegExp(pattern).test(bare)))
}

// The page a same-origin fetch came from (Referer), e.g. /api/generate called from
// /zh/generate/…; null when the browser sent none.
export function localeOfReferer(referer: string | null): Locale | null {
  if (!referer) return null
  try {
    return localeOfPath(new URL(referer).pathname)
  } catch {
    return null
  }
}
