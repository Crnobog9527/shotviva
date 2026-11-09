'use client'

import { useState, useTransition } from 'react'

import type { AdminInquiry } from '@/core/inquiries'
import { INQUIRY_STATUSES, LIMITS, type InquiryStatus } from '@/core/inquiries/rules'
import { Button } from '@/core/ui/button'
import { Textarea } from '@/core/ui/textarea'

import { formatBeijing } from '../shell/format'
import type { ActionResult } from '../templates/types'
import { INQUIRIES_COPY as COPY, inquiryErrorText } from './copy'

export type InquiryAdminActions = {
  save(input: { id: string; status: InquiryStatus; note: string }): Promise<ActionResult>
}

// The Owner's follow-up on one inquiry: its status and a private note, saved together. The
// server action refreshes the page, so the badge and the nav count follow.
export function FollowUpForm({ inquiry, save }: { inquiry: AdminInquiry; save: InquiryAdminActions['save'] }) {
  const [status, setStatus] = useState<InquiryStatus>(inquiry.status)
  const [note, setNote] = useState(inquiry.admin_note ?? '')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const submit = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await save({ id: inquiry.id, status, note }).catch(() => ({ ok: false, code: 'INTERNAL', message: '' }) as const)
      setMessage(result.ok ? { error: false, text: COPY.edit.saved } : { error: true, text: inquiryErrorText(result.code) })
    })
  }
  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold">{COPY.sections.follow}</h3>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm text-muted-foreground">{COPY.edit.status}</legend>
        <div className="flex flex-wrap gap-2">
          {INQUIRY_STATUSES.map((value) => (
            <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/15 has-[:checked]:text-primary">
              <input type="radio" name="inquiry-status" value={value} checked={status === value} onChange={() => setStatus(value)} className="accent-[var(--primary)]" />
              {COPY.statuses[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <label htmlFor="inquiry-note" className="text-sm text-muted-foreground">
          {COPY.edit.note}
        </label>
        <Textarea id="inquiry-note" value={note} maxLength={LIMITS.adminNote} rows={4} placeholder={COPY.edit.notePlaceholder} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? COPY.edit.saving : COPY.edit.save}
        </Button>
        {message ? (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm text-success'}>
            {message.text}
          </p>
        ) : null}
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          {COPY.fields.updatedAt} {formatBeijing(inquiry.updated_at)}
        </span>
      </div>
    </section>
  )
}
