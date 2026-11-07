'use client'

import { useMemo, useState, type ReactNode } from 'react'

import { useAdminAction } from '../shell/use-admin-action'
import type { ActionValue } from '../templates/types'
import type { BatchOutcome, UserListRow } from '../users/list-types'
import { BatchBar, type BatchKind } from './batch-bar'
import { BatchAdjustDialog, BatchBanDialog, type BatchAdjustInput, type Rejection } from './batch-dialogs'
import { USERS_COPY } from './copy'
import { useSelection } from './use-selection'
import { UsersCards } from './users-cards'
import { UsersTable } from './users-table'

const COPY = USERS_COPY.batch

export type UserBatchActions = {
  adjust: (input: BatchAdjustInput & { userIds: string[] }) => Promise<ActionValue<BatchOutcome>>
  setBanned: (input: { userIds: string[]; banned: boolean; reason: string }) => Promise<ActionValue<BatchOutcome>>
}

// summary: the count line, shown where the batch bar appears.
type Props = { rows: UserListRow[]; actions: UserBatchActions; summary: ReactNode }

// The page of users with ticks and the batch actions (ARCHITECTURE §10.a). The server action
// refreshes the page on success, so the list shows the new balances and statuses.
export function UsersList({ rows, actions, summary }: Props) {
  const pageIds = useMemo(() => rows.map((row) => row.id), [rows])
  const selection = useSelection(pageIds)
  const [open, setOpen] = useState<BatchKind | null>(null)
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const { pending, error, notice, run, clearError } = useAdminAction()
  const people = rows.filter((row) => selection.ids.includes(row.id))

  const pick = (kind: BatchKind) => {
    clearError()
    setRejection(null)
    setOpen(kind)
  }
  // A refused batch stays open and names who blocked it; a finished one closes and clears.
  const settle = (done: (outcome: Extract<BatchOutcome, { kind: 'done' }>) => string) => (outcome: BatchOutcome) => {
    if (outcome.kind === 'rejected') {
      setRejection({ reason: outcome.reason, people: rows.filter((row) => outcome.userIds.includes(row.id)) })
      return
    }
    setOpen(null)
    selection.clear()
    return done(outcome)
  }
  const shared = { people, pending, error, rejection, onCancel: () => setOpen(null) }

  return (
    // Room below the last card for the floating batch bar on phones.
    <div className={selection.ids.length > 0 ? 'grid gap-2 max-md:pb-36' : 'grid gap-2'}>
      <BatchBar
        count={selection.ids.length}
        pending={pending}
        onPick={pick}
        onClear={selection.clear}
        idle={
          <>
            {summary}
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          </>
        }
      />
      <div className="hidden md:block">
        <UsersTable rows={rows} selection={selection} />
      </div>
      <div className="md:hidden">
        <UsersCards rows={rows} selection={selection} />
      </div>
      {open === 'adjust' && people.length > 0 ? (
        <BatchAdjustDialog
          shared={shared}
          onConfirm={(input) => run(() => actions.adjust({ ...input, userIds: selection.ids }), settle((o) => COPY.done.adjust(o.changed, o.unchanged)))}
        />
      ) : null}
      {(open === 'ban' || open === 'unban') && people.length > 0 ? (
        <BatchBanDialog
          banned={open === 'ban'}
          shared={shared}
          onConfirm={(reason) =>
            run(
              () => actions.setBanned({ userIds: selection.ids, banned: open === 'ban', reason }),
              settle((o) => COPY.done[open](o.changed, o.unchanged)),
            )
          }
        />
      ) : null}
    </div>
  )
}
