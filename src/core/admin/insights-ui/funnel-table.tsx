import { Badge } from '../../ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table'
import { DASH, n, pct } from '../analytics-ui/format'
import { Section } from '../growth-ui/section'
import type { Counts, FunnelRow } from '../insights/funnel'
import type { Bucket } from '../insights/period'
import { stepsOf } from '../insights/steps'
import { INSIGHTS_COPY as COPY } from './copy'

const NUM = 'text-right font-mono tabular-nums whitespace-nowrap'

// One count with its conversion from the step before underneath.
export function StepCells({ counts }: { counts: Counts }) {
  return (
    <>
      {stepsOf(counts).map((step) => (
        <TableCell key={step.key} className={NUM}>
          <span className="block">{step.count === null ? DASH : n(step.count)}</span>
          {step.key !== 'visitors' ? <span className="block text-xs text-muted-foreground">{pct(step.conversion)}</span> : null}
        </TableCell>
      ))}
      <TableCell className={NUM}>{n(counts.imaged24h)}</TableCell>
    </>
  )
}

export function StepHeads() {
  return (
    <>
      {(['visitors', 'signups', 'imaged', 'paid'] as const).map((key) => (
        <TableHead key={key} className="text-right whitespace-nowrap">
          {COPY.funnel.steps[key].label}
        </TableHead>
      ))}
      <TableHead className="text-right whitespace-nowrap">{COPY.funnel.imaged24h.label}</TableHead>
    </>
  )
}

// Newest bucket first, the period's total last. Each row is the people who signed up in that
// bucket; visitors are the people who came that day or week.
export function FunnelTable({ rows, total, bucket }: { rows: FunnelRow[]; total: Counts; bucket: Bucket }) {
  return (
    <Section title={COPY.funnel.tableTitle} desc={COPY.funnel.desc}>
      <div className="min-w-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">{COPY.funnel.bucketCol[bucket]}</TableHead>
              <StepHeads />
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows].reverse().map((row) => (
              <TableRow key={row.bucket}>
                <TableCell className="font-mono whitespace-nowrap">
                  {row.bucket}
                  {row.maturing ? (
                    <Badge variant="outline" className="ml-2 font-sans">
                      {COPY.funnel.maturing}
                    </Badge>
                  ) : null}
                </TableCell>
                <StepCells counts={row.counts} />
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>{COPY.sources.all}</TableCell>
              <StepCells counts={total} />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Section>
  )
}
