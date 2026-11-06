import 'server-only'
import { getLocale } from 'next-intl/server'

import { DEFAULT_LOCALE, isLocale, type Locale } from './locales'
import { localizePath } from './paths'

// The current request's language: the [locale] root segment in Server Components, the locale
// router's header in Server Actions and Route Handlers (site/i18n/request.ts).
export async function currentLocale(): Promise<Locale> {
  const locale = await getLocale()
  return isLocale(locale) ? locale : DEFAULT_LOCALE
}

// A logical path (`/account`) in the current request's language (`/zh/account`).
export async function localized(path: string): Promise<string> {
  return localizePath(path, await currentLocale())
}
