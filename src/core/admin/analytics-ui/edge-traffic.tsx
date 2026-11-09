import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { readEdge, type EdgeRead, type EdgeData } from '../analytics/edge'
import type { Range } from '../analytics/range'
import { rate } from '../analytics/values'
import { formatBeijing } from '../shell/format'
import { ANALYTICS_COPY } from './copy'
import { n, pct } from './format'
import { BlockFrame, MetricLabel } from './parts'

const COPY = ANALYTICS_COPY.edge
const metrics = ['requests', 'verified', 'suspected', 'unclassified'] as const

const links = [{ href: 'https://vercel.com/dashboard', label: COPY.link }]

export function EdgeTrafficView({ result }: { result: EdgeRead }) {
  if (result.source === 'unknown') {
    return (
      <BlockFrame title={COPY.title} desc={COPY.unknown} links={links}>
        <p role="status" className="text-sm text-muted-foreground">{COPY.failure[result.reason]}</p>
      </BlockFrame>
    )
  }
  const snapshot = result.data
  const sites: [string, EdgeData['all']][] = [[COPY.all, snapshot.all]]
  if (snapshot.home) sites.push(['/', snapshot.home['/']], ['/zh', snapshot.home['/zh']])
  const bots = Object.entries(snapshot.verifiedBots).sort(([, left], [, right]) => right - left)
  return (
    <BlockFrame
      title={COPY.title}
      desc={COPY.scope(snapshot.host, Boolean(snapshot.home))}
      links={links}
    >
      <div className="grid gap-1">
        <p className="text-sm font-medium">
          {COPY.window[result.source]} {ANALYTICS_COPY.traffic.window(formatBeijing(snapshot.start), formatBeijing(snapshot.end))}
        </p>
        {result.reason && <p className="text-sm text-muted-foreground">{COPY.failure[result.reason]} {COPY.snapshotNote}</p>}
        <p className="text-xs text-muted-foreground">{COPY.coverage(formatBeijing(snapshot.firstNonzeroBucket), formatBeijing(snapshot.lastNonzeroBucket))}</p>
      </div>
      <Table aria-label={COPY.title}>
        <TableHeader>
          <TableRow>
            <TableHead>{COPY.range}</TableHead>
            {metrics.map((key) => (
              <TableHead key={key} className="text-right">
                <MetricLabel id={`edge-${key}`} metric={COPY.metrics[key]} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map(([label, counts]) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              <TableCell className="text-right tabular-nums">{n(counts.requests)}</TableCell>
              {(['verified', 'suspected', 'unclassified'] as const).map((key) => (
                <TableCell key={key} className="text-right tabular-nums">
                  {n(counts[key])} <span className="text-xs text-muted-foreground">({pct(rate(counts[key], counts.requests))})</span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {bots.length > 0 && (
        <details className="text-sm">
          <summary className="w-fit cursor-pointer">{COPY.bots}</summary>
          <dl className="mt-2 grid max-w-md gap-1">
            {bots.map(([name, amount]) => (
              <div key={name} className="flex justify-between gap-4">
                <dt>{name}</dt><dd className="tabular-nums">{n(amount)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </BlockFrame>
  )
}

export async function EdgeTraffic({ range }: { range: Range }) {
  return <EdgeTrafficView result={await readEdge(range)} />
}
