import type { Locale } from '@/core/i18n'
import { en } from './affiliate-agreement/en'
import { en as en20261121 } from './affiliate-agreement/en-2026-11-21'
import { zh } from './affiliate-agreement/zh'
import { zh as zh20261121 } from './affiliate-agreement/zh-2026-11-21'

// Add the reviewed English and Chinese texts together under the version used by operations.
// affiliate_settings.terms_version picks the text shown; earlier versions stay readable, so a
// release never strands the version operations still use (2026-11-21: commissions net of each
// order's processing fees, F7).
const published: ReadonlyArray<{ version: string; en: string; zh: string }> = [
  { version: '2026-11-10', en, zh },
  { version: '2026-11-21', en: en20261121, zh: zh20261121 },
]

export function affiliateAgreement(locale: Locale) {
  const latest = published.at(-1)
  if (!latest?.en.trim() || !latest.zh.trim()) return {}
  const earlier = Object.fromEntries(published.slice(0, -1).map((item) => [item.version, item[locale]]))
  return { affiliateAgreement: { version: latest.version, body: latest[locale], earlier } }
}
