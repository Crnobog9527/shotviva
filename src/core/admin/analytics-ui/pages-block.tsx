import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { pageViewsQuery, PAGE_SORTS, sortPages, type PageRow, type PageSort } from '../analytics/pages'
import { readPages } from '../analytics/load'
import { sqlEditorLink, webAnalyticsLink } from '../analytics/links'
import { ANALYTICS_COPY } from './copy'
import { delta, duration, n, pct } from './format'
import { analyticsHref, type AnalyticsQuery } from './href'
import { BlockFrame, DeltaText, Empty, MetricLabel, Unavailable } from './parts'

const COPY = ANALYTICS_COPY.pages
const ANCHOR = '#pages'

function SortHead({ sort, query }: { sort: PageSort; query: AnalyticsQuery }) {
  const metric = COPY.metrics[sort]
  const current = query.sort === sort
  return (
    <TableHead aria-sort={current ? 'descending' : undefined} className="text-right whitespace-nowrap">
      <MetricLabel
        id={`pages-${sort}`}
        metric={metric}
        className="justify-end"
        sort={{ href: analyticsHref(query, { sort }, ANCHOR), current, hint: COPY.sortHint(metric.label) }}
      />
    </TableHead>
  )
}

function Row({ row }: { row: PageRow }) {
  const cell = 'text-right font-mono tabular-nums'
  return (
    <TableRow>
      <TableCell className="max-w-64 truncate font-mono text-xs" title={row.path}>
        {row.path}
      </TableCell>
      <TableCell className={cell}>
        {n(row.views)} <DeltaText delta={delta(row.views, row.viewsPrev)} />
      </TableCell>
      <TableCell className={cell}>
        {n(row.visitors)} <DeltaText delta={delta(row.visitors, row.visitorsPrev)} />
      </TableCell>
      <TableCell className={cell}>{duration(row.avgSeconds)}</TableCell>
      <TableCell className={cell}>{pct(row.avgScroll)}</TableCell>
      <TableCell className={cell}>{pct(row.bounceRate)}</TableCell>
      <TableCell className={cell}>{pct(row.signupRate)}</TableCell>
      <TableCell className={cell}>{pct(row.purchaseRate)}</TableCell>
    </TableRow>
  )
}

export function PagesTable({ rows, query }: { rows: PageRow[]; query: AnalyticsQuery }) {
  if (rows.length === 0) return <Empty />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.page}</TableHead>
          {PAGE_SORTS.map((sort) => (
            <SortHead key={sort} sort={sort} query={query} />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortPages(rows, query.sort).map((row) => (
          <Row key={row.path} row={row} />
        ))}
      </TableBody>
    </Table>
  )
}

export async function PagesBlock({ query, projectId }: { query: AnalyticsQuery; projectId: string }) {
  const block = await readPages(query.range)
  const links =
    block.status === 'ok'
      ? [
          { href: sqlEditorLink(projectId, pageViewsQuery(block.window)), label: ANALYTICS_COPY.openInPostHog },
          { href: webAnalyticsLink(projectId), label: ANALYTICS_COPY.openWebAnalytics },
        ]
      : []
  return (
    <div id="pages" className="scroll-mt-4">
      <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
        {block.status === 'ok' ? <PagesTable rows={block.data} query={query} /> : <Unavailable />}
      </BlockFrame>
    </div>
  )
}
