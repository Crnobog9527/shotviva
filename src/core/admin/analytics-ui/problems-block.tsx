import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { cn } from '../../ui/cn'
import { readProblems } from '../analytics/load'
import { sqlEditorLink } from '../analytics/links'
import { failuresQuery, vitalsQuery, type FailureStats, type PageVitals, type Problems } from '../analytics/problems'
import type { Range } from '../analytics/range'
import { ANALYTICS_COPY } from './copy'
import { ms, n, pct, rating, type Vital } from './format'
import { BlockFrame, Empty, MetricLabel, Unavailable, type Metric } from './parts'

const COPY = ANALYTICS_COPY.problems
const VITALS: Vital[] = ['lcp', 'inp', 'cls', 'fcp']
const RATING_CLASS = { good: 'text-success', fair: 'text-foreground', poor: 'text-destructive' } as const

function Failures({ id, metric, stats, reasonName }: { id: string; metric: Metric; stats: FailureStats; reasonName(reason: string): string }) {
  return (
    <div className="grid content-start gap-3 rounded-lg border border-border bg-background/40 p-4">
      <MetricLabel id={id} metric={metric} className="text-sm text-muted-foreground" />
      <p className="font-mono text-2xl font-semibold tabular-nums">{n(stats.failed)}</p>
      <p className="text-xs text-muted-foreground">
        {COPY.rateLine(pct(stats.rate), pct(stats.ratePrev))} · {ANALYTICS_COPY.previousTimes(n(stats.failedPrev))}
      </p>
      {stats.reasons.length ? (
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">{COPY.topReasons}</p>
          <ol className="grid gap-1 text-sm">
            {stats.reasons.slice(0, 5).map((reason) => (
              <li key={reason.reason} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">{reasonName(reason.reason)}</span>
                <span className="font-mono tabular-nums">{n(reason.count)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.noFailures}</p>
      )}
    </div>
  )
}

function VitalCell({ metric, value }: { metric: Vital; value: number | null }) {
  const level = rating(metric, value)
  const text = metric === 'cls' ? (value === null ? '—' : value.toFixed(2)) : ms(value)
  return (
    <TableCell className="text-right font-mono whitespace-nowrap tabular-nums">
      <span className={cn(level ? RATING_CLASS[level] : 'text-muted-foreground')}>{text}</span>
      {level ? <span className={cn('ml-1.5 text-xs', RATING_CLASS[level])}>{COPY.rating[level]}</span> : null}
    </TableCell>
  )
}

export function VitalsTable({ rows }: { rows: PageVitals[] }) {
  if (rows.length === 0) return <Empty text={COPY.noVitals} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.page}</TableHead>
          {(['samples', ...VITALS] as const).map((key) => (
            <TableHead key={key} className="text-right whitespace-nowrap">
              <MetricLabel id={`vitals-${key}`} metric={COPY.vitals[key]} className="justify-end" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.path}>
            <TableCell className="max-w-64 truncate font-mono text-xs" title={row.path}>
              {row.path}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">{n(row.samples)}</TableCell>
            {VITALS.map((metric) => (
              <VitalCell key={metric} metric={metric} value={row[metric]} />
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const uploadReason = (reason: string) => COPY.uploadReasons[reason] ?? reason
const imageReason = (code: string) => (COPY.imageReasons[code] ? `${COPY.imageReasons[code]}（${code}）` : code)

export function ProblemsView({ problems }: { problems: Problems }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 md:grid-cols-2">
        <Failures id="problems-uploads" metric={COPY.uploads} stats={problems.uploads} reasonName={uploadReason} />
        <Failures id="problems-images" metric={COPY.images} stats={problems.images} reasonName={imageReason} />
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{COPY.vitalsTitle}</h3>
        <p className="text-xs text-muted-foreground">{COPY.vitalsDesc}</p>
        <VitalsTable rows={problems.vitals} />
      </div>
    </div>
  )
}

export async function ProblemsBlock({ range, projectId }: { range: Range; projectId: string }) {
  const block = await readProblems(range)
  const links =
    block.status === 'ok'
      ? [
          { href: sqlEditorLink(projectId, failuresQuery(block.window)), label: `${ANALYTICS_COPY.openInPostHog}（失败）` },
          { href: sqlEditorLink(projectId, vitalsQuery(block.window)), label: `${ANALYTICS_COPY.openInPostHog}（速度）` },
        ]
      : []
  return (
    <BlockFrame title={COPY.title} desc={COPY.desc} links={links}>
      {block.status === 'ok' ? <ProblemsView problems={block.data} /> : <Unavailable />}
    </BlockFrame>
  )
}
