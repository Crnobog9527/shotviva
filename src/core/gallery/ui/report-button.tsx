'use client'

import { useState } from 'react'

import { REPORT_NOTE_MAX, REPORT_REASONS, type ReportReason } from '../../moderation/reasons'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog'
import { useReport, type ReportText } from './use-report'

type Props = { jobId: string; loginHref: string; text: ReportText }

// The work page's report link and form (ARCHITECTURE §9 第 8 条). Its text comes from the server
// as props, so the gallery's messages stay out of every other page's bundle.
export function ReportButton({ jobId, loginHref, text }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const { state, send } = useReport(jobId, loginHref)
  const finished = state === 'done' || state === 'duplicate' || state === 'limited'
  return (
    <>
      <button type="button" className="text-sm text-[var(--muted-foreground)] underline underline-offset-4" onClick={() => setOpen(true)}>
        {text.open}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{finished ? text[state] : text.body}</DialogDescription>
          </DialogHeader>
          {finished ? null : (
            <ReportFields text={text} reason={reason} note={note} onReason={setReason} onNote={setNote} />
          )}
          {state === 'failed' ? <p role="alert" className="text-sm text-[var(--destructive)]">{text.failed}</p> : null}
          <DialogFooter>
            <button type="button" className="mk-cta mk-cta-neutral" onClick={() => setOpen(false)}>
              {text.cancel}
            </button>
            {finished ? null : (
              <button type="button" className="mk-cta" disabled={!reason || state === 'sending'} onClick={() => reason && send(reason, note)}>
                {state === 'sending' ? text.sending : text.submit}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type FieldsProps = {
  text: ReportText
  reason: ReportReason | null
  note: string
  onReason: (reason: ReportReason) => void
  onNote: (note: string) => void
}

function ReportFields({ text, reason, note, onReason, onNote }: FieldsProps) {
  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">{text.reasonLabel}</legend>
        {REPORT_REASONS.map((key) => (
          <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="report-reason" value={key} checked={reason === key} onChange={() => onReason(key)} />
            {text.reasons[key]}
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm">
        {text.noteLabel}
        <textarea
          value={note}
          maxLength={REPORT_NOTE_MAX}
          rows={3}
          onChange={(event) => onNote(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-transparent p-2 text-base"
        />
      </label>
    </div>
  )
}
