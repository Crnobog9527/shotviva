import { isLocale, type Locale } from '../i18n/locales'
import type { FeaturedBundles } from './locale-display'

// 首页「更多真实案例」 (migration 2006): the row of pairs under the home first screen, per language,
// as an admin picks it. Each entry is a published template or a 精选组合; the pictures are always
// the template's own covers. A language with no entries shows the page's built-in row.
export const CASE_STRIP_MAX = 8

export type CaseStripKind = 'template' | 'bundle'
export type CaseStripEntry = { kind: CaseStripKind; id: string }
export type HomeCaseStrip = Partial<Record<Locale, CaseStripEntry[]>>

export type CaseStripRow = { locale: string; rank: number; template_id: string | null; bundle_id: string | null }

export function toHomeCaseStrip(rows: readonly CaseStripRow[]): HomeCaseStrip {
  const strip: HomeCaseStrip = {}
  for (const row of [...rows].sort((a, b) => a.rank - b.rank)) {
    if (!isLocale(row.locale)) continue
    const entry: CaseStripEntry | null = row.template_id ? { kind: 'template', id: row.template_id } : row.bundle_id ? { kind: 'bundle', id: row.bundle_id } : null
    if (entry) (strip[row.locale] ??= []).push(entry)
  }
  return strip
}

// An entry as a public page shows it: a bundle carries its name in that language and its
// templates in order (the page drops any that are not live).
export type PublicCaseEntry =
  | { kind: 'template'; id: string }
  | { kind: 'bundle'; id: string; name: string; memberIds: string[] }

export function publicCaseEntries(entries: readonly CaseStripEntry[], bundles: FeaturedBundles | undefined, locale: Locale): PublicCaseEntry[] {
  const byId = new Map((bundles?.list ?? []).map((bundle) => [bundle.id, bundle]))
  return entries.flatMap((entry): PublicCaseEntry[] => {
    if (entry.kind === 'template') return [{ kind: 'template', id: entry.id }]
    const bundle = byId.get(entry.id)
    if (!bundle) return []
    return [{ kind: 'bundle', id: bundle.id, name: locale === 'zh' ? bundle.nameZh : bundle.nameEn, memberIds: bundle.templateIds }]
  })
}
