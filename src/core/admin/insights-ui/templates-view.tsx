import { LinkTabs } from '../analytics-ui/parts'
import { pct } from '../analytics-ui/format'
import { Section, SectionError } from '../growth-ui/section'
import { readEnd, readShares, readTemplateStats } from '../insights/load'
import { parsePeriod } from '../insights/period'
import { GROUPINGS, sortLines, templateLines } from '../insights/templates'
import { INSIGHTS_COPY as COPY } from './copy'
import { FiltersForm } from './filters-form'
import { insightsHref, type InsightsQuery } from './query'
import { TemplatesTable } from './templates-table'

type Props = { query: InsightsQuery; creditUsd: number | null }

// 「模板」 (ARCHITECTURE §16.2c): the database read for every template, PostHog for shares.
// creditUsd is the cheapest price per credit, passed in by the route so no price lives in core.
export async function TemplatesView({ query, creditUsd }: Props) {
  const range = { from: query.from, to: query.to, end: readEnd() }
  const period = parsePeriod(range.from, range.to, range.end)
  const [db, shares] = await Promise.all([readTemplateStats(range), readShares(range)])
  if (db.status !== 'ok') return <SectionError title={COPY.templates.title} />
  const input = { stats: db.data.stats.templates, shares: shares.status === 'ok' ? shares.data : null, creditUsd, redrawAlert: query.redraw }
  const perTemplate = templateLines(input, 'template')
  const lines = sortLines(query.group === 'template' ? perTemplate : templateLines(input, query.group), query.sort)
  const count = (pick: (flags: (typeof perTemplate)[number]['flags']) => boolean) => perTemplate.filter((l) => pick(l.flags)).length
  const tabs = GROUPINGS.map((group) => ({ key: group, label: COPY.templates.groupings[group], href: insightsHref(query, { group }) }))
  return (
    <div className="grid min-w-0 gap-6">
      <FiltersForm query={query} days={period.days} />
      <Section title={COPY.templates.title} desc={COPY.templates.desc}>
        <div className="flex flex-wrap items-center gap-3">
          <LinkTabs label={COPY.funnel.group} tabs={tabs} current={query.group} />
        </div>
        <p role="status" className="text-sm font-medium">
          {COPY.templates.flagSummary(count((f) => f.idle), count((f) => f.redraw), count((f) => f.failing))}
        </p>
        {shares.status !== 'ok' ? <p className="text-sm text-muted-foreground">{COPY.templates.sharesMissing}</p> : null}
        <TemplatesTable lines={lines} query={query} redrawText={pct(query.redraw)} />
        <p className="text-xs text-muted-foreground">{COPY.templates.sharesNote}</p>
      </Section>
    </div>
  )
}
