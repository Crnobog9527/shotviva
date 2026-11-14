'use client'

import type { AdminInquiryRow, InquiryFilter } from '@/core/inquiries'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { AllTick, RowTick, type RowSelection } from '../shell/bulk'
import { RecordLink } from '../shell/record-dialog'
import { INQUIRY_PARAM } from '../shell/record-dialog-url'
import { formatBeijing } from '../shell/format'
import { INQUIRIES_COPY as COPY } from './copy'
import { inquiriesHref } from './inquiries-href'
import { StatusBadge } from './status-badge'

const COLUMNS = ['createdAt', 'company', 'name', 'email', 'volume', 'uses', 'status'] as const

// One page of inquiries with a tick per row (every status can take a batch).
export function InquiriesTable({ rows, filter, selection }: { rows: AdminInquiryRow[]; filter: InquiryFilter; selection: RowSelection }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <AllTick selection={selection} />
          </TableHead>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-state={selection.has(row.id) ? 'selected' : undefined}>
            <TableCell className="w-10">
              <RowTick id={row.id} label={row.company} selection={selection} />
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{formatBeijing(row.created_at)}</TableCell>
            <TableCell className="min-w-40 whitespace-normal">
              <RecordLink param={INQUIRY_PARAM} base={inquiriesHref(filter)} id={row.id} className="line-clamp-2 text-sm font-medium">
                {row.company}
              </RecordLink>
            </TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-32 truncate" title={row.name}>
                {row.name}
              </span>
            </TableCell>
            <TableCell className="text-sm">
              <span className="block max-w-52 truncate" title={row.email}>
                {row.email}
              </span>
            </TableCell>
            <TableCell className="text-sm whitespace-nowrap">{COPY.volumes[row.monthly_volume]}</TableCell>
            <TableCell className="min-w-40 text-sm whitespace-normal">{row.uses.map((use) => COPY.uses[use]).join('、')}</TableCell>
            <TableCell className="whitespace-nowrap">
              <StatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
