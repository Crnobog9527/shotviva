'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/core/ui/table'

import type { UserListRow } from '../users/list-types'
import { RefusalFlag, TierBadge, UserStatus } from './badges'
import { USERS_COPY as COPY } from './copy'
import { AccountCell, AllCheckbox, CreditsCell, day, providerLabel, RowCheckbox } from './user-cells'
import type { Selection } from './use-selection'

const COLUMNS = ['account', 'tier', 'credits', 'provider', 'createdAt', 'lastJob', 'status'] as const

// The list from md up; phones get UsersCards. Ticked rows are tinted.
export function UsersTable({ rows, selection, currentUserId }: { rows: UserListRow[]; selection: Selection; currentUserId: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <AllCheckbox selection={selection} />
          </TableHead>
          {COLUMNS.map((column) => (
            <TableHead key={column} className="whitespace-nowrap">
              {COPY.columns[column]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id} data-state={selection.has(row.id) ? 'selected' : undefined}>
            <TableCell>
              <RowCheckbox row={row} selection={selection} self={row.id === currentUserId} />
            </TableCell>
            <TableCell className="max-w-72">
              <AccountCell row={row} />
            </TableCell>
            <TableCell>
              <TierBadge tier={row.tier} interval={row.interval} paidUntil={row.paidUntil} />
            </TableCell>
            <TableCell>
              <CreditsCell row={row} />
            </TableCell>
            <TableCell className="text-xs whitespace-nowrap">{providerLabel(row.provider)}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">{day(row.createdAt)}</TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">{day(row.lastGenerationAt)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap items-center gap-1.5">
                <UserStatus role={row.role} bannedAt={row.bannedAt} />
                <RefusalFlag flagged={row.refusalFlag} last24h={row.refusals24h} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
