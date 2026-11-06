import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { JobActions, type JobSupportActions } from '../support-ui'
import { formatBeijing } from '../shell/format'
import { JOBS_COPY as COPY } from './copy'
import { jobCostCell, type UnitCost } from './cost'
import { usdFine } from './cost-format'
import type { AdminJob } from './repository'

const COLUMNS = ['createdAt', 'user', 'template', 'status', 'model', 'resolution', 'credits', 'cost', 'source', 'duration', 'error', 'actions'] as const

function CostCell({ job, unitCost }: { job: AdminJob; unitCost: UnitCost }) {
  const cell = jobCostCell(job, unitCost)
  if (cell.kind === 'real') return <span className="font-mono text-xs">{usdFine.format(cell.usd)}</span>
  if (cell.kind === 'uncosted') {
    return (
      <span className="text-xs text-destructive" title={COPY.cost.uncostedHint}>
        {COPY.cost.uncosted}
      </span>
    )
  }
  if (cell.kind === 'estimate') {
    return (
      <span className="font-mono text-xs text-muted-foreground" title={COPY.cost.estimateHint}>
        {COPY.cost.estimate(usdFine.format(cell.usd))}
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">—</span>
}

const seconds = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)}s`)

const statusVariant = { running: 'secondary', succeeded: 'default', failed: 'destructive' } as const

type Props = { jobs: AdminJob[]; actions: JobSupportActions; unitCost: UnitCost }

export function JobsTable({ jobs, actions, unitCost }: Props) {
  if (jobs.length === 0) return <EmptyState title={COPY.empty} />
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
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(job.createdAt)}</TableCell>
            <TableCell>
              <Link href={`/admin/users/${job.userId}`} className="font-mono text-xs text-primary hover:underline">
                {job.userId.slice(0, 8)}
              </Link>
            </TableCell>
            <TableCell className="font-mono text-xs">{job.templateId}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[job.status]}>{COPY.status[job.status]}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">{job.model}</TableCell>
            <TableCell className="font-mono text-xs uppercase">{job.resolution}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {job.creditsCost} · {COPY.pools[job.creditPool]}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              <CostCell job={job} unitCost={unitCost} />
            </TableCell>
            <TableCell className="text-xs">{COPY.sources[job.source]}</TableCell>
            <TableCell className="font-mono text-xs">{seconds(job.durationMs)}</TableCell>
            <TableCell className="font-mono text-xs text-destructive">{job.errorCode ?? ''}</TableCell>
            <TableCell>
              <JobActions job={job} actions={actions} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
