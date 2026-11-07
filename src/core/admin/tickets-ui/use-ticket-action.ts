'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '../templates/types'
import { ticketErrorText } from './copy'

export type TicketAdminActions = {
  reply(input: { ticketId: string; body: string; close: boolean; images: string[] }): Promise<ActionResult>
  decide(input: { ticketId: string; decision: 'approved' | 'rejected'; amountCents?: number; body: string }): Promise<ActionResult>
}

// One ticket action at a time. The server action refreshes the page, so success only clears the
// form; errors show this page's copy for the code, never the server text.
export function useTicketAction() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = (work: () => Promise<ActionResult>, done: string, onDone?: () => void) => {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await work().catch(() => ({ ok: false, code: 'INTERNAL', message: '' }) as const)
      if (result.ok) {
        setNotice(done)
        onDone?.()
      } else {
        setError(ticketErrorText(result.code))
      }
    })
  }
  return { pending, error, notice, run }
}
