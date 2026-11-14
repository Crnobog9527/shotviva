import { parseLocale, parseSource, type LocaleFilter, type SourceFilter } from '../insights/funnel'
import { parseBucket, parsePeriod, type Bucket } from '../insights/period'
import { DEFAULT_REDRAW_ALERT, parseGrouping, parseRedrawAlert, parseSort, type Grouping, type Sort } from '../insights/templates'

// The 「漏斗」 and 「模板」 tabs keep their state in the URL (ARCHITECTURE §16.2c). Dates are always
// written out, so a link copied today still shows the same days tomorrow. The language filter is
// `lang`, not `locale`: a `locale` search parameter never reaches the page, it shares its name
// with the route's [locale] segment (seen on the test site, 2026-11-14).

export type InsightsView = 'funnel' | 'templates'
export type InsightsQuery = {
  view: InsightsView
  from: string
  to: string
  bucket: Bucket
  locale: LocaleFilter
  source: SourceFilter
  group: Grouping
  sort: Sort
  redraw: number
}

type Params = Record<string, string | string[] | undefined>
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export function parseInsights(view: InsightsView, params: Params, now: number): InsightsQuery {
  const period = parsePeriod(one(params.from), one(params.to), now)
  return {
    view,
    from: period.from,
    to: period.to,
    bucket: parseBucket(one(params.bucket)),
    locale: parseLocale(one(params.lang)),
    source: parseSource(one(params.source)),
    group: parseGrouping(one(params.group)),
    sort: parseSort(one(params.sort)),
    redraw: parseRedrawAlert(one(params.redraw)),
  }
}

export function insightsHref(query: InsightsQuery, patch: Partial<InsightsQuery> = {}): string {
  const next = { ...query, ...patch }
  const params = new URLSearchParams({ view: next.view, from: next.from, to: next.to })
  if (next.view === 'funnel') {
    if (next.bucket !== 'day') params.set('bucket', next.bucket)
    if (next.locale !== 'all') params.set('lang', next.locale)
    if (next.source !== 'all') params.set('source', next.source)
  } else {
    if (next.group !== 'template') params.set('group', next.group)
    if (next.sort !== 'uses') params.set('sort', next.sort)
    if (next.redraw !== DEFAULT_REDRAW_ALERT) params.set('redraw', String(Math.round(next.redraw * 100)))
  }
  return `/admin/analytics?${params.toString()}`
}
