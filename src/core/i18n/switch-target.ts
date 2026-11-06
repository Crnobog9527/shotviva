import { DEFAULT_LOCALE, type Locale } from './locales'
import { localizePath, matchesPaths } from './paths'

// Where "the other language" points from the current page (ARCHITECTURE §17): the same page
// when it has a translation, otherwise the other language's home. v1 has two languages, so
// the other one is always zh from English and en from Chinese.
export function otherLocale(locale: Locale): Locale {
  return locale === DEFAULT_LOCALE ? 'zh' : DEFAULT_LOCALE
}

export function switchHref(path: string, locale: Locale, translatedPaths: readonly string[]): string {
  const target = otherLocale(locale)
  return localizePath(matchesPaths(path, translatedPaths) ? path : '/', target)
}
