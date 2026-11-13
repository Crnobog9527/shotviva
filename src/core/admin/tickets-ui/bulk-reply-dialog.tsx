'use client'

import { useState } from 'react'

import { BODY_MAX } from '@/core/support/rules'
import { Button } from '@/core/ui/button'
import { Checkbox } from '@/core/ui/checkbox'
import { Textarea } from '@/core/ui/textarea'

import { BULK_COPY, BulkDialog, BulkResult, BulkTargets } from '../shell/bulk'
import { TICKETS_BULK_COPY as COPY } from './bulk-copy'
import type { TicketBulkRun } from './use-ticket-bulk'

// 批量回复: one text to every ticked ticket, optionally closing them. Sending emails each author,
// so it takes two steps: write, then a preview with the count and a second confirm.
export function BulkReplyDialog({ run }: { run: TicketBulkRun }) {
  const [body, setBody] = useState('')
  const [close, setClose] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const n = run.targets.length
  const finished = !!run.outcome
  const confirm = previewing ? (
    <>
      <Button variant="outline" disabled={run.pending} onClick={() => setPreviewing(false)}>
        {COPY.reply.back}
      </Button>
      <Button disabled={run.pending} onClick={() => run.send(body, close)}>
        {run.pending ? BULK_COPY.working : COPY.reply.send(n)}
      </Button>
    </>
  ) : (
    <Button disabled={body.trim().length === 0} onClick={() => setPreviewing(true)}>
      {COPY.reply.preview}
    </Button>
  )
  return (
    <BulkDialog
      title={previewing ? COPY.reply.previewTitle(n) : COPY.reply.title(n)}
      description={previewing ? COPY.reply.previewBody(n, close) : COPY.reply.body}
      pending={run.pending}
      error={run.error}
      finished={finished}
      onClose={run.close}
      confirm={confirm}
    >
      {finished && run.outcome ? (
        <BulkResult done={run.outcome.done.length} skipped={run.shownSkips} />
      ) : previewing ? (
        <Preview body={body} />
      ) : (
        <Compose body={body} setBody={setBody} close={close} setClose={setClose} />
      )}
      {!finished ? <BulkTargets label={COPY.targets} names={run.targets.map((t) => t.who)} /> : null}
    </BulkDialog>
  )
}

function Compose({ body, setBody, close, setClose }: { body: string; setBody: (v: string) => void; close: boolean; setClose: (v: boolean) => void }) {
  return (
    <div className="grid gap-3">
      <label htmlFor="ticket-bulk-reply" className="text-sm font-medium">
        {COPY.reply.label}
      </label>
      <Textarea id="ticket-bulk-reply" value={body} maxLength={BODY_MAX} rows={5} placeholder={COPY.reply.placeholder} onChange={(event) => setBody(event.target.value)} />
      <span className="justify-self-end font-mono text-xs text-muted-foreground">
        {body.length}/{BODY_MAX}
      </span>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={close} onCheckedChange={(value) => setClose(value === true)} />
        <span>{COPY.reply.alsoClose}</span>
      </label>
    </div>
  )
}

function Preview({ body }: { body: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs text-muted-foreground">{COPY.reply.previewLabel}</p>
      <p className="rounded-lg border border-border bg-muted p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{body.trim()}</p>
    </div>
  )
}
