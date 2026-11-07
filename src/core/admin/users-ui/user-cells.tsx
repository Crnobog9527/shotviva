'use client'

import { Checkbox } from '@/core/ui/checkbox'
import { cn } from '@/core/ui/cn'

import { formatBeijing } from '../shell/format'
import { accountLabel, formatAdminPhone } from '../users/label'
import type { UserListRow } from '../users/list-types'
import { USERS_COPY as COPY } from './copy'
import type { Selection } from './use-selection'
import { UserLink } from './user-link'

// Pieces shared by the desktop table and the phone cards of the users list.

// Email and phone in full: only admins see this page (ARCHITECTURE §10.a).
export function AccountCell({ row }: { row: UserListRow }) {
  const label = accountLabel(row)
  return (
    <div className="grid min-w-0 gap-0.5">
      <UserLink userId={row.id} className="truncate font-medium" title={COPY.open(label)}>
        {label}
      </UserLink>
      {row.email && row.phone ? <span className="font-mono text-xs text-muted-foreground">{formatAdminPhone(row.phone)}</span> : null}
    </div>
  )
}

export function CreditsCell({ row }: { row: UserListRow }) {
  return (
    <span className="font-mono text-sm whitespace-nowrap tabular-nums">
      {row.credits}
      <span className="text-muted-foreground"> / {row.freeCredits}</span>
    </span>
  )
}

export const providerLabel = (provider: string | null) => (provider ? (COPY.providers[provider] ?? provider) : COPY.never)

export const day = (iso: string | null) => formatBeijing(iso) ?? COPY.never

// The box is 16px; the label around it makes a 40px target (a button is labelable, so a press on
// the padding toggles it), which matters on the phone cards. Admin rows and the signed-in admin's
// own row are greyed out with the reason as a tooltip.
export function RowCheckbox({ row, selection, self }: { row: UserListRow; selection: Selection; self: boolean }) {
  const locked = row.role === 'admin' ? COPY.locked.admin : self ? COPY.locked.self : null
  return (
    <label className={cn('-m-3 grid size-10 place-items-center', locked ? 'cursor-not-allowed' : 'cursor-pointer')} title={locked ?? undefined}>
      <Checkbox
        aria-label={locked ? `${accountLabel(row)}：${locked}` : COPY.selectOne(accountLabel(row))}
        disabled={locked !== null}
        checked={selection.has(row.id)}
        onCheckedChange={() => selection.toggle(row.id)}
      />
    </label>
  )
}

export function AllCheckbox({ selection }: { selection: Selection }) {
  return (
    <Checkbox
      aria-label={COPY.selectAll}
      title={COPY.selectAll}
      checked={selection.all ? true : selection.some ? 'indeterminate' : false}
      onCheckedChange={() => selection.toggleAll()}
    />
  )
}
