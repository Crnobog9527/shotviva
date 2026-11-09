import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { locale as rootLocale } from 'next/root-params'

import { routing, type Locale } from '@/core/i18n'

import { affiliateAgreement } from '../content/affiliate-terms'
import { loadMessages } from './messages'

// Server Components read the locale from the [locale] root segment (next/root-params, which
// keeps pages static). Server Actions and Route Handlers have no root params: there the
// locale header set by the proxy's locale router (`requestLocale`) answers instead.
async function fromRootParams(): Promise<string | undefined> {
  try {
    return await rootLocale()
  } catch {
    return undefined
  }
}

export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  const candidate = explicit ?? (await fromRootParams()) ?? (await requestLocale)
  const locale: Locale = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale
  return { locale, messages: { ...await loadMessages(locale), ...affiliateAgreement(locale) } }
})
