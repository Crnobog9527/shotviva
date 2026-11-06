import { defineRouting } from 'next-intl/routing'

import { DEFAULT_LOCALE, LOCALES } from './locales'

// ARCHITECTURE §17 / 建站规格 §6: English unprefixed, Chinese under /zh. No redirect by
// Accept-Language, IP or cookie (localeDetection off); the cookie is written only by an explicit
// choice in the switcher or the banner (locale-cookie.ts), never by the middleware. hreflang is
// emitted per page in metadata, only where both versions exist, so no global Link header.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
})
