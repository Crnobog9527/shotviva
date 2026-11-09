import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { usdFine } from '../jobs/cost-format'
import { COSTS_COPY } from './copy'
import type { ReconcileRow } from './reconcile'

const COPY = COSTS_COPY
const COLUMNS = ['day', 'billed', 'ours', 'tests', 'difference', 'costed', 'missing'] as const

const money = (value: number | null) => (value === null ? COPY.dash : usdFine.format(value))

// A difference over a cent stands out; smaller ones are rounding.
const differenceClass = (value: number | null) => (value !== null && Math.abs(value) >= 0.01 ? 'text-destructive' : 'text-muted-foreground')

export function CostsTable({ rows }: { rows: ReconcileRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.day}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{row.day}</TableCell>
            <TableCell className="font-mono text-xs">{money(row.billed)}</TableCell>
            <TableCell className="font-mono text-xs">{money(row.cost_usd)}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">{row.test_cost_usd ? money(row.test_cost_usd) : COPY.dash}
              {row.by_provider?.map((group) => (
                <div key={group.provider} className="mt-1 break-all">
                  {group.provider} {money(group.cost_usd)} {COPY.testModel(group.runs)}
                </div>
              ))}
            </TableCell>
            <TableCell className={`font-mono text-xs ${differenceClass(row.difference)}`}>{money(row.difference)}</TableCell>
            <TableCell className="font-mono text-xs">{row.costed}</TableCell>
            <TableCell className={`font-mono text-xs ${row.uncosted > 0 ? 'text-destructive' : ''}`}>
              {row.uncosted} / {row.no_usage}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
