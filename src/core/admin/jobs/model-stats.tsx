import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { ModelUsage } from '../overview/stats'
import { JOBS_COPY } from './copy'
import { modelCosts, type CostSummary, type UnitCost } from './cost'
import { usdFine, usdTotal } from './cost-format'

const COPY = JOBS_COPY.stats

type Props = { usage: ModelUsage[]; days: number; unitCost: UnitCost }

function CostCells({ cost, uncosted }: { cost: CostSummary; uncosted: number }) {
  return (
    <>
      <TableCell className="font-mono">{usdTotal.format(cost.real)}</TableCell>
      <TableCell className="font-mono text-muted-foreground">{cost.estimated > 0 ? COPY.estimated(usdTotal.format(cost.estimated)) : '—'}</TableCell>
      <TableCell className="font-mono">{cost.perImage === null ? '—' : usdFine.format(cost.perImage)}</TableCell>
      <TableCell className={`font-mono ${uncosted > 0 ? 'text-destructive' : ''}`}>{uncosted > 0 ? uncosted : '—'}</TableCell>
    </>
  )
}

const HEADERS = [COPY.model, COPY.resolution, COPY.jobs, COPY.succeeded, COPY.cost, COPY.estimate, COPY.perImage, COPY.uncosted]

// Count and real cost per model × resolution over the overview's period (admin_dashboard_stats,
// T33). Pre-T33 jobs carry no usage and are estimated in their own column, labelled 「估算」.
export function ModelStats({ usage, days, unitCost }: Props) {
  const { rows, total } = modelCosts(usage, unitCost)
  const uncosted = rows.reduce((sum, row) => sum + row.uncosted, 0)
  return (
    <section className="grid gap-2 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">{COPY.title(days)}</h2>
      <p className="text-xs text-muted-foreground">{COPY.note}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {HEADERS.map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.model}/${row.resolution}`}>
                <TableCell className="font-mono text-xs">{row.model}</TableCell>
                <TableCell className="font-mono text-xs uppercase">{row.resolution}</TableCell>
                <TableCell className="font-mono">{row.jobs}</TableCell>
                <TableCell className="font-mono">{row.succeeded}</TableCell>
                <CostCells cost={row} uncosted={row.uncosted} />
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">
                {COPY.total}
              </TableCell>
              <CostCells cost={total} uncosted={uncosted} />
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  )
}
