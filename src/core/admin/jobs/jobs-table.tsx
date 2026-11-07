import { Badge } from '@/core/ui/badge'
import { CopyText } from '@/core/ui/copy-text'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { JobActions, type JobSupportActions } from '../support-ui'
import { formatBeijing } from '../shell/format'
import { JOBS_COPY as COPY } from './copy'
import { jobCostCell, type UnitCost } from './cost'
import { usdFine } from './cost-format'
import type { AdminJob } from './repository'
import { UserLink } from '../users-ui/user-link'

const COLUMNS = ['createdAt', 'ref', 'user', 'template', 'status', 'model', 'resolution', 'credits', 'cost', 'source', 'duration', 'actions'] as const

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

// Kept in view on the right while a narrow window (1280) scrolls the table sideways (T78).
const STICKY = 'sticky right-0 bg-background shadow-[inset_1px_0_0_var(--border)]'

// The status, with why it failed (the error code) and whether the user deleted the work under
// it rather than in columns of their own: both are rare, and the table must fit at 1440 (T78).
function StatusCell({ job }: { job: AdminJob }) {
  return (
    <TableCell>
      <Badge variant={statusVariant[job.status]}>{COPY.status[job.status]}</Badge>
      {job.errorCode ? <div className="mt-1 font-mono text-xs text-destructive">{job.errorCode}</div> : null}
      {job.deletedByUser ? <div className="mt-1 text-xs text-muted-foreground">{COPY.deletedByUser}</div> : null}
    </TableCell>
  )
}

function JobRow({ job, actions, unitCost }: { job: AdminJob; actions: JobSupportActions; unitCost: UnitCost }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(job.createdAt)}</TableCell>
      <TableCell className="text-xs">
        <CopyText value={job.ref} label={COPY.copyRef} copied={COPY.copied} />
      </TableCell>
      <TableCell>
        <UserLink userId={job.userId} className="font-mono text-xs">
          {job.userId.slice(0, 8)}
        </UserLink>
      </TableCell>
      <TableCell className="font-mono text-xs">{job.templateId}</TableCell>
      <StatusCell job={job} />
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
      <TableCell className={STICKY}>
        <JobActions job={job} actions={actions} />
      </TableCell>
    </TableRow>
  )
}

export function JobsTable({ jobs, actions, unitCost }: Props) {
  if (jobs.length === 0) return <EmptyState title={COPY.empty} />
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column} className={column === 'actions' ? STICKY : undefined}>
              {COPY.columns[column]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} actions={actions} unitCost={unitCost} />
        ))}
      </TableBody>
    </Table>
  )
}
