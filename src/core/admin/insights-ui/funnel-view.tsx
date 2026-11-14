import { SectionError } from '../growth-ui/section'
import { funnelBreakdown, funnelSeries, type FunnelInput } from '../insights/funnel'
import { readCohort, readEnd, readFunnelPostHog } from '../insights/load'
import { parsePeriod } from '../insights/period'
import { BreakdownTable } from './breakdown-table'
import { INSIGHTS_COPY as COPY } from './copy'
import { FiltersForm } from './filters-form'
import { FunnelSummary } from './funnel-summary'
import { FunnelTable } from './funnel-table'
import type { InsightsQuery } from './query'

function notes(posthog: { status: string; data?: { truncated: boolean } }, source: string): string[] {
  const list: string[] = []
  if (source === 'graylum' || source === 'unknown') list.push(COPY.funnel.visitorsNotFor)
  else if (posthog.status !== 'ok') list.push(COPY.funnel.visitorsMissing)
  if (posthog.data?.truncated) list.push(COPY.funnel.truncated)
  return list
}

// 「漏斗」 (ARCHITECTURE §16.2c). The database read decides who is in the funnel; PostHog adds
// visitors and fills in language and source where the database has none.
export async function FunnelView({ query }: { query: InsightsQuery }) {
  const range = { from: query.from, to: query.to, end: readEnd() }
  const period = parsePeriod(range.from, range.to, range.end)
  const db = await readCohort(range)
  if (db.status !== 'ok') return <SectionError title={COPY.funnel.title} />
  const posthog = await readFunnelPostHog(range, query.bucket, db.data.cohort)
  const ok = posthog.status === 'ok' ? posthog.data : null
  const input: FunnelInput = { period, bucket: query.bucket, people: db.data.cohort.people, touches: ok?.touches ?? null, visitors: ok?.visitors ?? null }
  const filters = { locale: query.locale, source: query.source }
  const series = funnelSeries(input, filters)
  const breakdown = funnelBreakdown(input, filters)
  const lines = notes({ status: posthog.status, data: ok ?? undefined }, query.source)
  return (
    <div className="grid min-w-0 gap-6">
      <FiltersForm query={query} days={period.days} />
      <p className="text-sm text-muted-foreground">{COPY.scope(db.data.cohort.admin_ids.length)}</p>
      <FunnelSummary counts={series.total} notes={lines} />
      <FunnelTable rows={series.rows} total={series.total} bucket={query.bucket} />
      <BreakdownTable bySource={breakdown.bySource} byLocale={breakdown.byLocale} />
    </div>
  )
}
