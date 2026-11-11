import { AD_SOURCES, SOURCE_TABLE } from './source-table'
import type { SourceReads } from './sources'
import type { GrowthPeriod } from './stats'

// The source table (ARCHITECTURE §16.2b): visitors from PostHog; sign-ups, buyers and money from
// the database, each person credited to one source. A promoter binding in the database
// (profiles.referred_by) wins; otherwise the person's first page view in PostHog decides; with
// neither the person is 「认不出来」. Search, AI, social and ads show each source under the group;
// a group's numbers are the sum of its sources.

export const TOP_KEYS = ['search', 'ai', 'social', 'affiliate', 'ads', 'direct', 'other', 'unknown'] as const
export type TopKey = (typeof TOP_KEYS)[number]

export type SourceLine = { key: string; visitors: number | null; signups: number; payers: number; net: number }
export type SourceGroupRow = SourceLine & { key: TopKey; children: SourceLine[] }

const CHILDREN: Partial<Record<TopKey, string[]>> = {
  search: SOURCE_TABLE.filter((d) => d.group === 'search').map((d) => d.key),
  ai: SOURCE_TABLE.filter((d) => d.group === 'ai').map((d) => d.key),
  social: SOURCE_TABLE.filter((d) => d.group === 'social').map((d) => d.key),
  ads: AD_SOURCES.map((a) => a.key),
}

const empty = (key: string, visitors: number | null): SourceLine => ({ key, visitors, signups: 0, payers: 0, net: 0 })

function lines(db: GrowthPeriod, reads: SourceReads | null): Map<string, SourceLine> {
  const referred = new Set([...db.cohort_referred, ...db.buyers.filter((b) => b.referred).map((b) => b.user_id)])
  const sourceOf = (id: string): string => (referred.has(id) ? 'affiliate' : (reads?.firstTouch[id] ?? 'unknown'))
  const map = new Map<string, SourceLine>()
  const line = (key: string) => {
    let found = map.get(key)
    if (!found) map.set(key, (found = empty(key, key === 'unknown' || !reads ? null : (reads.visitors[key] ?? 0))))
    return found
  }
  for (const key of Object.keys(reads?.visitors ?? {})) line(key)
  for (const id of db.cohort) line(sourceOf(id)).signups += 1
  for (const buyer of db.buyers) {
    const row = line(sourceOf(buyer.user_id))
    row.payers += 1
    row.net += buyer.net_usd
  }
  return map
}

const sum = (rows: SourceLine[], pick: (row: SourceLine) => number) => rows.reduce((total, row) => total + pick(row), 0)

export function attribute(db: GrowthPeriod, reads: SourceReads | null): SourceGroupRow[] {
  const byKey = lines(db, reads)
  const rows = TOP_KEYS.map((top): SourceGroupRow => {
    const childKeys = CHILDREN[top]
    if (!childKeys) {
      const own = byKey.get(top) ?? empty(top, top === 'unknown' || !reads ? null : 0)
      return { ...own, key: top, children: [] }
    }
    const children = childKeys.map((key) => byKey.get(key) ?? empty(key, reads ? 0 : null))
    return {
      key: top,
      visitors: reads ? sum(children, (row) => row.visitors ?? 0) : null,
      signups: sum(children, (row) => row.signups),
      payers: sum(children, (row) => row.payers),
      net: sum(children, (row) => row.net),
      children,
    }
  })
  // 「认不出来」 only when someone is in it.
  return rows.filter((row) => row.key !== 'unknown' || row.signups > 0 || row.payers > 0)
}

// Nothing came from it this period: hidden behind 「显示全部」.
export const isEmptyLine = (row: SourceLine) => !row.visitors && row.signups === 0 && row.payers === 0
