import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from './locales'

// Browser-only: remembers an explicit choice (switcher click, banner click or dismiss) so the
// banner stays away afterwards (ARCHITECTURE §17). Plain document.cookie: no storage API, and
// the navigation itself stays a real link.
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
}

export function hasChosenLocale(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`))
}

// navigator.languages[0] is the visitor's first choice; zh-TW and zh-HK still read Simplified
// Chinese better than English, so any zh* counts.
export function prefersChinese(languages: readonly string[]): boolean {
  return (languages[0] ?? '').toLowerCase().startsWith('zh')
}
