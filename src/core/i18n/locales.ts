// v1 languages (ARCHITECTURE §17): English unprefixed, Simplified Chinese under /zh.
// site.config `locales.enabled` must list exactly these (site-config test).
export const LOCALES = ['en', 'zh'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

// The cookie a visitor's explicit choice is stored in (globe menu and hint, footer switch,
// account Language row). Functional, never analytics; the proxy reads it to send later visits to
// the chosen language, and the globe hint stays away once it exists (ARCHITECTURE §17).
export const LOCALE_COOKIE = 'NEXT_LOCALE'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const HTML_LANG: Record<Locale, string> = { en: 'en', zh: 'zh-Hans' }
// hreflang values (建站规格 §6.1): zh-Hans, never zh-CN, since the audience is not one country.
const HREFLANG: Record<Locale, string> = { en: 'en', zh: 'zh-Hans' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function htmlLang(locale: Locale): string {
  return HTML_LANG[locale]
}

export function hreflang(locale: Locale): string {
  return HREFLANG[locale]
}
