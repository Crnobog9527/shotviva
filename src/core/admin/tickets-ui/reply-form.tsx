'use client'

import { useState } from 'react'

import { BODY_MAX } from '@/core/support/rules'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'

import { TICKETS_COPY as COPY } from './copy'
import { useTicketAction, type TicketAdminActions } from './use-ticket-action'

// Reply, reply and close, or just close. The user sees the reply under Help & feedback with the
// "new reply" dot; nothing is emailed (ARCHITECTURE §10).
export function ReplyForm({ ticketId, closed, reply }: { ticketId: string; closed: boolean; reply: TicketAdminActions['reply'] }) {
  const [body, setBody] = useState('')
  const action = useTicketAction()
  const send = (close: boolean) =>
    action.run(() => reply({ ticketId, body, close }), close ? COPY.reply.closed : COPY.reply.sent, () => setBody(''))
  const empty = body.trim().length === 0
  return (
    <section className="grid gap-2">
      <label htmlFor="ticket-admin-reply" className="font-semibold">
        {COPY.reply.label}
      </label>
      <Textarea
        id="ticket-admin-reply"
        value={body}
        maxLength={BODY_MAX}
        rows={5}
        placeholder={COPY.reply.placeholder}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={action.pending || empty} onClick={() => send(false)}>
          {COPY.reply.send}
        </Button>
        <Button type="button" variant="secondary" disabled={action.pending || empty} onClick={() => send(true)}>
          {COPY.reply.sendAndClose}
        </Button>
        {!closed && (
          <Button type="button" variant="ghost" disabled={action.pending || !empty} onClick={() => send(true)}>
            {COPY.reply.closeOnly}
          </Button>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {body.length}/{BODY_MAX}
        </span>
      </div>
      {action.error && <p role="alert" className="text-sm text-destructive">{action.error}</p>}
      {action.notice && <p role="status" className="text-sm text-muted-foreground">{action.notice}</p>}
    </section>
  )
}
