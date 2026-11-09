import type { Locale } from '../i18n/locales'
import { localizePath } from '../i18n/paths'
import { appOrigin } from '../site-url'

export function consumerReferralUrl(slug: string, locale: Locale): string {
  const url = new URL(localizePath('/', locale), appOrigin)
  url.searchParams.set('ref', slug)
  return url.href
}
