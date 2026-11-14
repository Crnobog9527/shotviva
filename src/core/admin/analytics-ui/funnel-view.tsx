import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import type { Funnel, FunnelCounts } from '../analytics/funnel'
import { FUNNEL_STEPS, type FunnelDim } from '../analytics/funnel-options'
import { rate } from '../analytics/values'
import { ANALYTICS_COPY } from './copy'
import { n, pct, pointDelta } from './format'
import { DeltaText, Empty, MetricLabel } from './parts'

const COPY = ANALYTICS_COPY.funnel

const overall = (counts: FunnelCounts) => rate(counts.at(-1) ?? 0, counts[0] ?? 0)

export function segmentLabel(dim: FunnelDim, value: string): string {
  if (value === '') return COPY.other
  const names: Record<string, string> | undefined = dim in COPY.values ? COPY.values[dim as keyof typeof COPY.values] : undefined
  return names?.[value] ?? (value === 'null' ? COPY.unknown : value)
}

// One bar per step: width = share of entries; the loss against the step before beneath it.
function Steps({ counts }: { counts: FunnelCounts }) {
  const entries = counts[0] ?? 0
  return (
    <ol className="grid gap-3">
      {FUNNEL_STEPS.map((step, i) => {
        const value = counts[i] ?? 0
        const before = i === 0 ? value : (counts[i - 1] ?? 0)
        const share = rate(value, entries) ?? 0
        return (
          <li key={step.key} className="grid gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <MetricLabel id={`funnel-${step.key}`} metric={COPY.steps[step.key]} className="font-medium" />
              <span className="font-mono tabular-nums">
                {n(value)} <span className="text-xs text-muted-foreground">{COPY.ofEntry} {pct(rate(value, entries))}</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share * 100, value ? 1 : 0)}%` }} />
            </div>
            {i > 0 && before > value ? (
              <p className="text-xs text-muted-foreground">{COPY.lost(n(before - value), pct(rate(before - value, before)))}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function Segments({ funnel }: { funnel: Funnel }) {
  if (funnel.segments.length === 0) return <Empty />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{COPY.segment}</TableHead>
          {FUNNEL_STEPS.map((step) => (
            <TableHead key={step.key} className="text-right whitespace-nowrap">
              {COPY.steps[step.key].label}
            </TableHead>
          ))}
          <TableHead className="text-right whitespace-nowrap">{COPY.overall.label}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {funnel.segments.map((segment) => (
          <TableRow key={segment.value || '__other'}>
            <TableCell className="whitespace-nowrap">{segmentLabel(funnel.dim, segment.value)}</TableCell>
            {segment.counts.map((value, i) => (
              <TableCell key={FUNNEL_STEPS[i]?.key ?? i} className="text-right font-mono tabular-nums">
                {n(value)}
              </TableCell>
            ))}
            <TableCell className="text-right font-mono tabular-nums">{pct(overall(segment.counts))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function FunnelView({ funnel }: { funnel: Funnel }) {
  const now = overall(funnel.current)
  return (
    <div className="grid gap-5">
      {funnel.dim === 'source' ? <p className="text-xs text-muted-foreground">{ANALYTICS_COPY.traffic.funnelNote}</p> : null}
      {funnel.dim === 'visitor' ? <p className="text-xs text-muted-foreground">{COPY.visitorNote}</p> : null}
      {(funnel.current[0] ?? 0) === 0 ? <Empty /> : <Steps counts={funnel.current} />}
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <MetricLabel id="funnel-overall" metric={COPY.overall} />
        <span className="font-mono font-semibold tabular-nums">{pct(now)}</span>
        <DeltaText delta={pointDelta(now, overall(funnel.previous))} />
      </p>
      {funnel.dim === 'none' ? null : <Segments funnel={funnel} />}
    </div>
  )
}
