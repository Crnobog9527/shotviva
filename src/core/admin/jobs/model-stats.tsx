import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { ModelUsage } from '../overview/stats'
import { JOBS_COPY } from './copy'
import { estimateCosts } from './cost'

const COPY = JOBS_COPY.stats
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })

type Props = { usage: ModelUsage[]; days: number; unitCost: Readonly<Record<string, number>> }

// Count and estimated cost per model × resolution over the overview's period (admin_dashboard_stats).
export function ModelStats({ usage, days, unitCost }: Props) {
  const { rows, total } = estimateCosts(usage, unitCost)
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
              {[COPY.model, COPY.resolution, COPY.jobs, COPY.succeeded, COPY.unit, COPY.cost].map((label) => (
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
                <TableCell className="font-mono">{row.unit === null ? COPY.unknownUnit : usd.format(row.unit)}</TableCell>
                <TableCell className="font-mono">{row.cost === null ? '—' : usd.format(row.cost)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={5} className="font-semibold">
                {COPY.total}
              </TableCell>
              <TableCell className="font-mono font-semibold">{usd.format(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </section>
  )
}
