import type { Locale } from '@/core/i18n'

// Add the reviewed English and Chinese texts together under the version used by operations.
const published: ReadonlyArray<{ version: string; en: string; zh: string }> = []

export function affiliateAgreement(locale: Locale) {
  const latest = published.at(-1)
  if (!latest?.en.trim() || !latest.zh.trim()) return {}
  return { affiliateAgreement: { version: latest.version, body: latest[locale] } }
}
