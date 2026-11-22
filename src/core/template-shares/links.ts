import { localizePath } from '../i18n/paths'
import type { Locale } from '../i18n/locales'
import { appOrigin } from '../site-url'
import { templateSharePath } from './rules'

// A share link as sent: this deployment's origin, the sharer's language, and their partner slug
// when they have one (repository.ts sharerRefSlug), so the proxy records the referral.
export function templateShareUrl(id: string, locale: Locale, refSlug: string | null): string {
  const url = new URL(localizePath(templateSharePath(id), locale), appOrigin)
  if (refSlug) url.searchParams.set('ref', refSlug)
  return url.href
}
