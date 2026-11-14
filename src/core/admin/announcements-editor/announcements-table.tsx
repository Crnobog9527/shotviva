'use client'

import type { AdminAnnouncementRow } from '@/core/announcements/rules'
import { Badge } from '@/core/ui/badge'
import { Button } from '@/core/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import { ANNOUNCEMENTS_COPY as COPY } from './copy'
import { formatBeijing, statusOf } from './form-state'

type Props = {
  rows: AdminAnnouncementRow[]
  now: number
  pending: boolean
  onEdit: (row: AdminAnnouncementRow) => void
  onSwitch: (row: AdminAnnouncementRow) => void
}

const COLUMNS = ['message', 'tone', 'close', 'window', 'status'] as const

function closeText(row: AdminAnnouncementRow) {
  if (!row.dismissible) return COPY.closeRules.never
  return row.reshow_after_days === null ? COPY.closeRules.changed : COPY.closeRules.days(row.reshow_after_days)
}

function windowText(row: AdminAnnouncementRow) {
  return `${formatBeijing(row.starts_at) ?? COPY.open} → ${formatBeijing(row.ends_at) ?? COPY.open}`
}

export function AnnouncementsTable({ rows, now, pending, onEdit, onSwitch }: Props) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{COPY.empty}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{COPY.columns[column]}</TableHead>
          ))}
          <TableHead className="text-right">{COPY.columns.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const status = statusOf(row, now)
          return (
            <TableRow key={row.id}>
              <TableCell className="max-w-80">
                <div className="truncate">{row.message_zh}</div>
                <div className="truncate text-xs text-muted-foreground">{row.message_en}</div>
              </TableCell>
              <TableCell>{COPY.tones[row.tone]}</TableCell>
              <TableCell className="whitespace-nowrap">{closeText(row)}</TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">{windowText(row)}</TableCell>
              <TableCell>
                <Badge variant={status === 'live' ? 'default' : 'secondary'}>{COPY.status[status]}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => onEdit(row)}>
                    {COPY.edit}
                  </Button>
                  <Button variant={row.is_active ? 'outline' : 'default'} size="sm" disabled={pending} onClick={() => onSwitch(row)}>
                    {row.is_active ? COPY.deactivate : COPY.activate}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
