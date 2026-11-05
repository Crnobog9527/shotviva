import Link from 'next/link'

import { Badge } from '@/core/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { EmptyState } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import { JOBS_COPY as COPY } from './copy'
import type { AdminJob } from './repository'

const COLUMNS = ['createdAt', 'user', 'template', 'status', 'model', 'resolution', 'credits', 'source', 'duration', 'error'] as const

const seconds = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)}s`)

const statusVariant = { running: 'secondary', succeeded: 'default', failed: 'destructive' } as const

export function JobsTable({ jobs }: { jobs: AdminJob[] }) {
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
            <TableCell className="text-xs">{COPY.sources[job.source]}</TableCell>
            <TableCell className="font-mono text-xs">{seconds(job.durationMs)}</TableCell>
            <TableCell className="font-mono text-xs text-destructive">{job.errorCode ?? ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
