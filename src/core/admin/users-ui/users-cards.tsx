'use client'

import { cn } from '@/core/ui/cn'

import type { UserListRow } from '../users/list-types'
import { RefusalFlag, TierBadge, UserStatus } from './badges'
import { USERS_COPY as COPY } from './copy'
import { AccountCell, AllCheckbox, CreditsCell, day, providerLabel, RowCheckbox } from './user-cells'
import type { Selection } from './use-selection'

// The list below md: one card per user, the same facts as the table, nothing scrolls sideways.
export function UsersCards({ rows, selection, currentUserId }: { rows: UserListRow[]; selection: Selection; currentUserId: string }) {
  return (
    <div className="grid gap-2">
      <label className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
        <AllCheckbox selection={selection} />
        {COPY.selectAll}
      </label>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg border border-border p-3', selection.has(row.id) && 'bg-muted/60')}
          >
            <div className="pt-0.5">
              <RowCheckbox row={row} selection={selection} self={row.id === currentUserId} />
            </div>
            <div className="grid min-w-0 gap-2">
              <div className="flex items-start justify-between gap-2">
                <AccountCell row={row} />
                <UserStatus role={row.role} bannedAt={row.bannedAt} />
              </div>
              <RefusalFlag flagged={row.refusalFlag} last24h={row.refusals24h} />
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <TierBadge tier={row.tier} interval={row.interval} paidUntil={row.paidUntil} />
                <span className="text-xs text-muted-foreground">
                  {COPY.columns.credits} <CreditsCell row={row} />
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <Fact term={COPY.columns.provider} value={providerLabel(row.provider)} />
                <Fact term={COPY.columns.createdAt} value={day(row.createdAt).slice(0, 10)} mono />
                <Fact term={COPY.columns.lastJob} value={day(row.lastGenerationAt).slice(0, 10)} mono />
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Fact({ term, value, mono = false }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className={cn('truncate', mono && 'font-mono tabular-nums')}>{value}</dd>
    </div>
  )
}
