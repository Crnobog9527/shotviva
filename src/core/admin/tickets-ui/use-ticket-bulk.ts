'use client'

import { useState } from 'react'

import type { AdminTicketRow } from '@/core/support'
import type { BulkTicketSkip } from '@/core/support/rules/bulk'

import { useBulkRun, type BulkOutcome, type RowSelection, type ShownSkip } from '../shell/bulk'
import type { ActionValue } from '../templates/types'
import { TICKETS_BULK_COPY as COPY } from './bulk-copy'
import { ticketWho } from './tickets-table'

export type TicketBulkActions = {
  reply(input: { ticketIds: string[]; body: string; close: boolean }): Promise<ActionValue<BulkOutcome<BulkTicketSkip>>>
}

export type TicketBulkKind = 'reply' | 'close'

type Target = { id: string; who: string }

export type TicketBulkRun = {
  targets: Target[]
  pending: boolean
  error: string | null
  outcome: BulkOutcome<BulkTicketSkip> | null
  shownSkips: ShownSkip[]
  send(body: string, close: boolean): void
  close(): void
}

// The open batch dialog's state. The ticked tickets are fixed when the dialog opens, so the list
// refreshing behind it (rows leaving the filter) cannot change what is sent or how it is named.
export function useTicketBulk(rows: AdminTicketRow[], selection: RowSelection, actions: TicketBulkActions) {
  const [kind, setKind] = useState<TicketBulkKind | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const run = useBulkRun<BulkTicketSkip>(selection.keepOnly)
  const open = (next: TicketBulkKind) => {
    run.reset()
    setTargets(rows.filter((row) => selection.ids.includes(row.id)).map((row) => ({ id: row.id, who: ticketWho(row) })))
    setKind(next)
  }
  const names = new Map(targets.map((target) => [target.id, target.who]))
  const state: TicketBulkRun = {
    targets,
    pending: run.pending,
    error: run.error,
    outcome: run.outcome,
    shownSkips: (run.outcome?.skipped ?? []).map((skip) => ({ id: skip.id, who: names.get(skip.id) ?? skip.id, why: COPY.skips[skip.reason] })),
    send: (body, close) => run.start(() => actions.reply({ ticketIds: targets.map((target) => target.id), body, close })),
    close: () => setKind(null),
  }
  return { kind, open, state }
}
