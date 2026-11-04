import { getRequestConfig } from 'next-intl/server'

import { site } from '../site.config'

// v1 ships English only with no locale prefix, so there is no i18n routing yet:
// every request resolves to the site's default locale.
export default getRequestConfig(async () => {
  const locale = site.locales.default
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
