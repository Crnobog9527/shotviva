'use client'

import { useCallback, useState } from 'react'

import type { HelpActions } from './help-actions'
import type { Choice } from './form-state'
import { TicketForm } from './ticket-form'
import { useLoad } from './use-load'

type Props = { actions: Pick<HelpActions, 'create' | 'loadWorks'>; payments: readonly Choice[]; onSent(ticketId: string): void }

const NO_WORKS: readonly Choice[] = []

// New ticket. The payments come with the account page (its Purchases list is the same read);
// the works for "Image issue" are read when the tab first opens. A sent form starts over empty.
export function HelpNewView({ actions, payments, onSent }: Props) {
  const works = useLoad(actions.loadWorks)
  const [round, setRound] = useState(0)
  const sent = useCallback(
    (ticketId: string) => {
      setRound((value) => value + 1)
      onSent(ticketId)
    },
    [onSent],
  )
  return <TicketForm key={round} submit={actions.create} payments={payments} works={works.data ?? NO_WORKS} onSent={sent} />
}
