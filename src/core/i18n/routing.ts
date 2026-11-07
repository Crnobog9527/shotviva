import { defineRouting } from 'next-intl/routing'

import { DEFAULT_LOCALE, LOCALES } from './locales'

// ARCHITECTURE §17 / 建站规格 §6: English unprefixed, Chinese under /zh. No redirect by
// Accept-Language or IP (localeDetection off), and next-intl neither reads nor writes the
// cookie: NEXT_LOCALE is written only by an explicit choice (locale-cookie.ts), and our proxy
// gate reads it to send a visitor to the chosen language's twin (locale-redirect.ts). hreflang
// is emitted per page in metadata, only where both versions exist, so no global Link header.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
})
