import { DEFAULT_LOCALE, type Locale } from './locales'
import { localizePath, matchesPaths, splitLocale } from './paths'

export type LocaleRedirectInput = {
  method: string
  // The address as requested, with the /zh prefix when there is one.
  pathname: string
  search: string
  // The visitor's choice (NEXT_LOCALE, or user_metadata.locale on signed-in pages); null: none.
  chosen: Locale | null
}

// Where a visitor who chose a language goes instead (ARCHITECTURE §17 「怎么选语言」): the same page
// in the chosen language, query kept, but only between twins: a page without a Chinese version
// is never redirected. Only page loads (GET / HEAD) move; a server action's POST stays where it
// is. The target is already in the chosen language, so it never redirects again. Crawlers carry
// no cookie, so they always get the page they asked for.
export function localeRedirect(input: LocaleRedirectInput, translatedPaths: readonly string[]): string | null {
  if (!input.chosen || (input.method !== 'GET' && input.method !== 'HEAD')) return null
  const { locale, path } = splitLocale(input.pathname)
  if (locale === input.chosen || !matchesPaths(path, translatedPaths)) return null
  const target = input.chosen === DEFAULT_LOCALE ? path : localizePath(path, input.chosen)
  return `${target}${input.search}`
}
