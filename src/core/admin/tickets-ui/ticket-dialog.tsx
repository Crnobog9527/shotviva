'use client'

import { useMemo } from 'react'

import type { RenewalReview, ShownAdminTicket } from '@/core/support'

import { RecordDialogHost, reloading, type RecordLoader } from '../shell/record-dialog'
import { TICKET_PARAM } from '../shell/record-dialog-url'
import type { UserDetail } from '../users/types'
import { TICKETS_COPY as COPY } from './copy'
import { TicketDetailView } from './ticket-detail'
import type { TicketAdminActions } from './use-ticket-action'

// What the ticket dialog shows: the same reads the detail page made (ticket with signed image
// URLs, its author, the attached work's number, a billing ticket's renewal review).
export type TicketDialogData = { ticket: ShownAdminTicket; renewal: RenewalReview | null; user: UserDetail | null; jobRef: string | null }

type Props = { load: RecordLoader<TicketDialogData>; actions: TicketAdminActions; stripeLive: boolean }

// /admin/tickets?ticket=<id>: the ticket over the list. Every action reads the dialog again once it
// worked; the action's refresh() updates the list row behind it.
export function TicketDialogHost({ load, actions, stripeLive }: Props) {
  return (
    <RecordDialogHost param={TICKET_PARAM} title={COPY.detailTitle} load={load}>
      {(data, reload) => <TicketDialogBody data={data} reload={reload} actions={actions} stripeLive={stripeLive} />}
    </RecordDialogHost>
  )
}

function TicketDialogBody({ data, reload, actions, stripeLive }: { data: TicketDialogData; reload: () => void } & Omit<Props, 'load'>) {
  const live = useMemo<TicketAdminActions>(
    () => ({
      reply: reloading(actions.reply, reload),
      decide: reloading(actions.decide, reload),
      resolveRenewal: actions.resolveRenewal && reloading(actions.resolveRenewal, reload),
      clawback: actions.clawback && { preview: actions.clawback.preview, apply: reloading(actions.clawback.apply, reload) },
    }),
    [actions, reload],
  )
  return <TicketDetailView ticket={data.ticket} renewal={data.renewal} user={data.user} jobRef={data.jobRef} stripeLive={stripeLive} actions={live} />
}
