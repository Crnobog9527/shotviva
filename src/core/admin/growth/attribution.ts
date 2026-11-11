import { SOURCE_GROUPS, type SourceGroup, type SourceReads } from './sources'
import type { GrowthPeriod } from './stats'

// The source table (ARCHITECTURE §16.2b): visitors from PostHog; sign-ups, buyers and money from
// the database, each person credited to one group. A promoter binding in the database
// (profiles.referred_by) wins; otherwise the person's first page view in PostHog decides; with
// neither the person is 「认不出来」.

export type SourceKey = SourceGroup | 'unknown'
export const SOURCE_KEYS: readonly SourceKey[] = [...SOURCE_GROUPS, 'unknown']

export type SourceRow = { key: SourceKey; visitors: number | null; signups: number; payers: number; net: number }

export function attribute(db: GrowthPeriod, reads: SourceReads | null): SourceRow[] {
  const referred = new Set([...db.cohort_referred, ...db.buyers.filter((b) => b.referred).map((b) => b.user_id)])
  const groupOf = (id: string): SourceKey => (referred.has(id) ? 'affiliate' : (reads?.firstTouch[id] ?? 'unknown'))
  const rows = new Map<SourceKey, SourceRow>(
    SOURCE_KEYS.map((key) => [key, { key, visitors: key === 'unknown' || !reads ? null : reads.visitors[key], signups: 0, payers: 0, net: 0 }]),
  )
  for (const id of db.cohort) rows.get(groupOf(id))!.signups += 1
  for (const buyer of db.buyers) {
    const row = rows.get(groupOf(buyer.user_id))!
    row.payers += 1
    row.net += buyer.net_usd
  }
  // 「认不出来」 only when someone is in it.
  return [...rows.values()].filter((row) => row.key !== 'unknown' || row.signups > 0 || row.payers > 0)
}
