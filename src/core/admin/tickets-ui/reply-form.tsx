'use client'

import { useCallback, useState } from 'react'

import { BODY_MAX } from '@/core/support/rules'
import { TicketImagesField, type ImagesText } from '@/core/support/ui'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'

import { TICKETS_COPY as COPY } from './copy'
import { useTicketAction, type TicketAdminActions } from './use-ticket-action'

const IMAGES_TEXT: ImagesText = {
  ...COPY.images,
  error: (code) => COPY.images.errors[code],
}

// Reply, reply and close, or just close. The user sees the reply under Help & feedback with the
// "new reply" dot; nothing is emailed (ARCHITECTURE §10). A reply can carry up to 3 images
// (T69); a bare close cannot.
export function ReplyForm({ ticketId, closed, reply }: { ticketId: string; closed: boolean; reply: TicketAdminActions['reply'] }) {
  const [body, setBody] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [imagesBusy, setImagesBusy] = useState(false)
  // A sent reply starts a fresh images field.
  const [round, setRound] = useState(0)
  const onKeys = useCallback((keys: string[]) => setImages(keys), [])
  const action = useTicketAction()
  const sent = () => {
    setBody('')
    setRound((value) => value + 1)
  }
  const send = (close: boolean) =>
    action.run(() => reply({ ticketId, body, close, images: empty ? [] : images }), close ? COPY.reply.closed : COPY.reply.sent, sent)
  const empty = body.trim().length === 0
  const blocked = action.pending || imagesBusy
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
      <TicketImagesField key={round} text={IMAGES_TEXT} onBusyChange={setImagesBusy} onKeys={onKeys} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={blocked || empty} onClick={() => send(false)}>
          {COPY.reply.send}
        </Button>
        <Button type="button" variant="secondary" disabled={blocked || empty} onClick={() => send(true)}>
          {COPY.reply.sendAndClose}
        </Button>
        {!closed && (
          <Button type="button" variant="ghost" disabled={blocked || !empty || images.length > 0} onClick={() => send(true)}>
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
