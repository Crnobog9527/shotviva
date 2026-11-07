'use client'

import { useCallback, useState } from 'react'

import type { HelpActions } from './help-actions'
import type { Choice } from './form-state'
import { TicketForm } from './ticket-form'
import { useLoad } from './use-load'

type Props = {
  actions: Pick<HelpActions, 'create' | 'loadWorks'>
  payments: readonly Choice[]
  // The work "Problem with this photo?" sent along (T78): picked, with "Image issue" chosen.
  job: string | null
  onSent(ticketId: string): void
}

const NO_WORKS: readonly Choice[] = []

// New ticket. The payments come with the account page (its Purchases list is the same read);
// the works for "Image issue" are read when the tab first opens, the sent-along one included
// even when it is older than the picker's list. A sent form starts over empty.
export function HelpNewView({ actions, payments, job, onSent }: Props) {
  const { loadWorks } = actions
  // Kept once sent along: moving to My tickets drops &job= from the address, and that must not
  // reset a half-written ticket.
  const [kept, setKept] = useState(job)
  if (job && job !== kept) setKept(job)
  const works = useLoad(useCallback(() => loadWorks(kept), [loadWorks, kept]))
  const [round, setRound] = useState(0)
  const sent = useCallback(
    (ticketId: string) => {
      setRound((value) => value + 1)
      onSent(ticketId)
    },
    [onSent],
  )
  return (
    <TicketForm
      key={`${round}:${kept ?? ''}`}
      submit={actions.create}
      payments={payments}
      works={works.data ?? NO_WORKS}
      job={round === 0 ? kept : null}
      onSent={sent}
    />
  )
}
