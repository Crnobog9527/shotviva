import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { formatBeijing } from '../shell/format'
import type { LedgerEntry, UserJob } from '../users/types'
import { USERS_COPY as COPY } from './copy'

const JOB_COLUMNS = ['createdAt', 'template', 'status', 'cost', 'pool', 'error'] as const
const LEDGER_COLUMNS = ['createdAt', 'pool', 'kind', 'delta', 'balance', 'reason'] as const

function Head({ columns }: { columns: readonly string[] }) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((label) => (
          <TableHead key={label}>{label}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
}

export function UserJobsTable({ jobs }: { jobs: UserJob[] }) {
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">{COPY.detail.noJobs}</p>
  return (
    <Table>
      <Head columns={JOB_COLUMNS.map((column) => COPY.jobColumns[column])} />
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(job.createdAt)}</TableCell>
            <TableCell className="font-mono text-xs">{job.templateId}</TableCell>
            <TableCell>{COPY.jobStatus[job.status]}</TableCell>
            <TableCell className="font-mono">{job.creditsCost}</TableCell>
            <TableCell>{COPY.pools[job.creditPool]}</TableCell>
            <TableCell className="font-mono text-xs">{job.errorCode ?? ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{COPY.detail.noLedger}</p>
  return (
    <Table>
      <Head columns={LEDGER_COLUMNS.map((column) => COPY.ledgerColumns[column])} />
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(entry.createdAt)}</TableCell>
            <TableCell>{COPY.pools[entry.pool]}</TableCell>
            <TableCell>{COPY.kinds[entry.kind] ?? entry.kind}</TableCell>
            <TableCell className={entry.delta > 0 ? 'font-mono text-success' : 'font-mono'}>
              {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
            </TableCell>
            <TableCell className="font-mono">{entry.balanceAfter}</TableCell>
            <TableCell className="max-w-72 truncate text-xs" title={entry.reason}>
              {entry.reason}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
