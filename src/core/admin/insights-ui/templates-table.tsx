import { Badge } from '../../ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { DASH, n, pct } from '../analytics-ui/format'
import { Empty, MetricLabel } from '../analytics-ui/parts'
import { usdFine, usdTotal } from '../jobs/cost-format'
import type { Sort, TemplateLine } from '../insights/templates'
import { INSIGHTS_COPY as COPY } from './copy'
import { insightsHref, type InsightsQuery } from './query'

const NUM = 'text-right font-mono tabular-nums whitespace-nowrap'
const COLS = COPY.templates.columns
type Col = keyof typeof COLS

// Column order; a column with a sort key gets a sort link on its name.
const HEADS: { col: Col; sort?: Sort }[] = [
  { col: 'uses', sort: 'uses' }, { col: 'users', sort: 'users' }, { col: 'success', sort: 'success' }, { col: 'errors' },
  { col: 'redraw', sort: 'redraw' }, { col: 'cost', sort: 'cost' }, { col: 'credits' }, { col: 'margin', sort: 'margin' },
  { col: 'freeCost' }, { col: 'favourites', sort: 'favourites' }, { col: 'shares', sort: 'shares' },
]

const warn = (on: boolean) => (on ? `${NUM} font-semibold text-destructive` : NUM)
const money = (value: number | null, fine = false) => (value === null ? DASH : (fine ? usdFine : usdTotal).format(value))

function Flags({ line, redrawText }: { line: TemplateLine; redrawText: string }) {
  const flags = [
    !line.live && line.members === 1 ? COPY.templates.flags.offline : null,
    line.flags.idle ? COPY.templates.flags.idle : null,
    line.flags.redraw ? COPY.templates.flags.redraw(redrawText) : null,
    line.flags.failing ? COPY.templates.flags.failing : null,
  ].filter((f): f is string => f !== null)
  if (!flags.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag} variant={flag === COPY.templates.flags.offline ? 'outline' : 'destructive'}>
          {flag}
        </Badge>
      ))}
    </span>
  )
}

function NameCell({ line, query, redrawText }: { line: TemplateLine; query: InsightsQuery; redrawText: string }) {
  const name = line.label || (query.group === 'series' ? COPY.templates.noSeries : line.key)
  return (
    <TableCell className="min-w-44 max-w-64 align-top">
      <span className="block truncate font-medium">{name}</span>
      <span className="block truncate font-mono text-xs text-muted-foreground">
        {query.group === 'template' ? line.key : COPY.templates.members(line.members)}
      </span>
      <Flags line={line} redrawText={redrawText} />
    </TableCell>
  )
}

function LineRow({ line, query, redrawText }: { line: TemplateLine; query: InsightsQuery; redrawText: string }) {
  return (
    <TableRow>
      <NameCell line={line} query={query} redrawText={redrawText} />
      <TableCell className={NUM}>{n(line.uses)}</TableCell>
      <TableCell className={NUM}>{n(line.users)}</TableCell>
      <TableCell className={warn(line.flags.failing)}>{pct(line.successRate)}</TableCell>
      <TableCell className="min-w-36 font-mono text-xs">
        {line.errors.length ? line.errors.map((e) => <span key={e.code} className="block whitespace-nowrap">{e.code} × {n(e.count)}</span>) : DASH}
      </TableCell>
      <TableCell className={warn(line.flags.redraw)}>{pct(line.redrawRate)}</TableCell>
      <TableCell className={NUM}>{money(line.costPerImage, true)}</TableCell>
      <TableCell className={NUM}>{line.creditsPerImage === null ? DASH : line.creditsPerImage.toFixed(1)}</TableCell>
      <TableCell className={warn(line.margin !== null && line.margin < 0)}>{pct(line.margin)}</TableCell>
      <TableCell className={NUM}>{line.free_cost_usd > 0 ? money(line.free_cost_usd) : DASH}</TableCell>
      <TableCell className={NUM}>{n(line.favourites)} <span className="text-muted-foreground">({n(line.favourites_added)})</span></TableCell>
      <TableCell className={NUM}>{n(line.shares)} <span className="text-muted-foreground">({n(line.shareOpens)})</span></TableCell>
    </TableRow>
  )
}

export function TemplatesTable({ lines, query, redrawText }: { lines: TemplateLine[]; query: InsightsQuery; redrawText: string }) {
  if (!lines.length) return <Empty text={COPY.templates.empty} />
  return (
    <div className="min-w-0 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{COPY.templates.groupings[query.group]}</TableHead>
            {HEADS.map(({ col, sort }) => (
              <TableHead key={col} className="text-right whitespace-nowrap">
                <MetricLabel
                  id={`insights-tpl-${col}`}
                  metric={COLS[col]}
                  className="justify-end"
                  sort={sort ? { href: insightsHref(query, { sort }), current: query.sort === sort, hint: `按${COLS[col].label}排序` } : undefined}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <LineRow key={line.key} line={line} query={query} redrawText={redrawText} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
