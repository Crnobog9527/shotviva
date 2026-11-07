import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from './locales'

// Where a signed-in visitor's choice is also stored, in user_metadata.locale (app/api/locale).
export const LOCALE_PREFERENCE_ENDPOINT = '/api/locale'

// Browser-only: remembers an explicit choice (globe menu, the globe hint, the footer switch, the
// account Language row) for a year, so the proxy sends later visits to that language and the hint
// stays away (ARCHITECTURE §17 「怎么选语言」). Written before the link navigates, so the proxy
// never bounces the click back. A signed-in account keeps the choice too (emails use it): the
// beacon survives the navigation, and the endpoint ignores visitors who are not signed in.
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
  navigator.sendBeacon?.(LOCALE_PREFERENCE_ENDPOINT, locale)
}

// The stored choice in a Cookie header, or null when there is none (or it is not a language).
export function chosenLocale(cookieHeader: string): Locale | null {
  for (const part of cookieHeader.split(';')) {
    const [name, value] = part.trim().split('=')
    if (name === LOCALE_COOKIE) return isLocale(value) ? value : null
  }
  return null
}

export function hasChosenLocale(cookieHeader: string): boolean {
  return chosenLocale(cookieHeader) !== null
}

// Any Chinese entry in the browser's language list counts, not only the first: many Chinese
// readers keep English first on a work machine. zh-TW and zh-HK still read Simplified Chinese
// better than English, so any zh* counts.
export function prefersChinese(languages: readonly string[]): boolean {
  return languages.some((language) => language.toLowerCase().startsWith('zh'))
}
