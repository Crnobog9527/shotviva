import { ALL_BUCKET, type Touches, type VisitorRow } from './posthog'
import { bucketOf, bucketsOf, type Bucket, type Period } from './period'
import type { CohortPerson } from './reads'

// The 「漏斗」 tab's arithmetic (ARCHITECTURE §16.2c): visitors → sign-ups → first image → first
// payment, for the people who signed up in each bucket, followed up to the end of the read.
// Each person has one language and one source; the page only shows the totals worked out here.

export const FUNNEL_SOURCES = ['share', 'graylum', 'affiliate', 'ads', 'organic', 'unknown'] as const
export type FunnelSource = (typeof FUNNEL_SOURCES)[number]
export const SOURCE_FILTERS = ['all', ...FUNNEL_SOURCES] as const
export type SourceFilter = (typeof SOURCE_FILTERS)[number]
export const LOCALE_FILTERS = ['all', 'en', 'zh'] as const
export type LocaleFilter = (typeof LOCALE_FILTERS)[number]
export type PersonLocale = 'en' | 'zh' | 'unknown'

// Graylum and 认不出来 people never passed through a page view PostHog could credit, so their
// visitor column has no number.
const NO_VISITORS: ReadonlySet<SourceFilter> = new Set(['graylum', 'unknown'])

export const parseSource = (value: unknown): SourceFilter =>
  (SOURCE_FILTERS as readonly unknown[]).includes(value) ? (value as SourceFilter) : 'all'
export const parseLocale = (value: unknown): LocaleFilter => (value === 'en' || value === 'zh' ? value : 'all')

// A PostHog source key (growth/source-table.ts, or 'share') as one of the funnel's groups.
export function groupOfKey(key: string): FunnelSource {
  if (key === 'share' || key === 'affiliate') return key
  if (key.startsWith('ads:')) return 'ads'
  return key === '' ? 'unknown' : 'organic'
}

// The database wins: a Graylum link, then a promoter binding; then the share link the sign-up
// carried or the first page view.
export function sourceOfPerson(person: CohortPerson, touches: Touches | null): FunnelSource {
  if (person.graylum) return 'graylum'
  if (person.referred) return 'affiliate'
  const touch = touches?.[person.id]
  if (!touch) return 'unknown'
  return touch.shared ? 'share' : groupOfKey(touch.source)
}

export function localeOfPerson(person: CohortPerson, touches: Touches | null): PersonLocale {
  return person.locale ?? touches?.[person.id]?.locale ?? 'unknown'
}

export type Counts = { visitors: number | null; signups: number; imaged: number; imaged24h: number; paid: number }
export type FunnelFilters = { locale: LocaleFilter; source: SourceFilter }

const DAY_MS = 86_400_000
const zero = (visitors: number | null): Counts => ({ visitors, signups: 0, imaged: 0, imaged24h: 0, paid: 0 })

function add(counts: Counts, person: CohortPerson) {
  counts.signups += 1
  if (person.first_image_at) {
    counts.imaged += 1
    if (Date.parse(person.first_image_at) - Date.parse(person.signed_at) <= DAY_MS) counts.imaged24h += 1
  }
  if (person.first_paid_at) counts.paid += 1
}

function visitorsBy(rows: readonly VisitorRow[] | null, filters: FunnelFilters): Map<string, number> | null {
  if (!rows || NO_VISITORS.has(filters.source)) return null
  const map = new Map<string, number>()
  for (const row of rows) {
    if (filters.locale !== 'all' && row.locale !== filters.locale) continue
    if (filters.source !== 'all' && groupOfKey(row.source) !== filters.source) continue
    map.set(row.bucket, (map.get(row.bucket) ?? 0) + row.visitors)
  }
  return map
}

export type FunnelInput = {
  period: Period
  bucket: Bucket
  people: readonly CohortPerson[]
  touches: Touches | null
  visitors: readonly VisitorRow[] | null
}
export type FunnelSeries = { rows: { bucket: string; counts: Counts }[]; total: Counts }

const matches = (input: FunnelInput, filters: FunnelFilters) => (person: CohortPerson) =>
  (filters.locale === 'all' || localeOfPerson(person, input.touches) === filters.locale) &&
  (filters.source === 'all' || sourceOfPerson(person, input.touches) === filters.source)

export function funnelSeries(input: FunnelInput, filters: FunnelFilters): FunnelSeries {
  const visitors = visitorsBy(input.visitors, filters)
  const of = (bucket: string) => (visitors ? (visitors.get(bucket) ?? 0) : null)
  const rows = bucketsOf(input.period, input.bucket).map((bucket) => ({ bucket, counts: zero(of(bucket)) }))
  const byBucket = new Map(rows.map((row) => [row.bucket, row.counts]))
  const total = zero(of(ALL_BUCKET))
  for (const person of input.people.filter(matches(input, filters))) {
    const counts = byBucket.get(bucketOf(person.signed_at, input.bucket))
    if (counts) add(counts, person)
    add(total, person)
  }
  return { rows, total }
}

// The whole period split by source (keeping the language filter) and by language (keeping the
// source filter), so the drop of each group can be compared.
export function funnelBreakdown(input: FunnelInput, filters: FunnelFilters) {
  return {
    bySource: FUNNEL_SOURCES.map((source) => ({ key: source, counts: funnelSeries(input, { ...filters, source }).total })),
    byLocale: (['en', 'zh'] as const).map((locale) => ({ key: locale, counts: funnelSeries(input, { ...filters, locale }).total })),
  }
}
