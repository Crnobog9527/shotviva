'use client'

import { CheckIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { buttonVariants } from '../../ui/button'
import { cn } from '../../ui/cn'
import { ResponsiveSheet } from '../../ui/responsive-sheet'
import type { InquiryPage } from '../rules'
import type { InquiryCopy } from './copy'
import { InquiryFormView } from './inquiry-form'
import { useInquiryForm, type InquiryActions } from './use-inquiry-form'

export type InquiryDialogActions = InquiryActions & { prefill(): Promise<{ email: string | null; phone: string | null }> }

type Props = {
  open: boolean
  onOpenChange(open: boolean): void
  copy: InquiryCopy
  page: InquiryPage
  actions: InquiryDialogActions
  // Told once the inquiry is stored, so the button can open a fresh form next time.
  onSent(): void
}

// The business inquiry dialog (DESIGN §6.9 item 8, T86): a full-height drawer on phones and a
// 640px dialog from md up (ResponsiveSheet `tall`), the form, and after a stored send the
// confirmation in the same place, with no navigation. Loaded only once the button is pressed.
// Closing keeps what was typed until the page is left; a sent form opens fresh next time.
export default function InquiryDialog({ open, onOpenChange, copy, page, actions, onSent }: Props) {
  const form = useInquiryForm(page, actions)
  usePrefill(open, actions, form.fill)
  useEffect(() => {
    if (form.sent) onSent()
  }, [form.sent, onSent])
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={form.sent ? copy.success.title : copy.title} description={form.sent ? copy.success.body : copy.description} tall>
      {form.sent ? <Sent copy={copy} onClose={() => onOpenChange(false)} /> : <InquiryFormView form={form} copy={copy} />}
    </ResponsiveSheet>
  )
}

// Asks once per page view; a visitor without a session gets nothing back.
function usePrefill(open: boolean, actions: InquiryDialogActions, fill: (start: { email?: string; phone?: string }) => void) {
  const asked = useRef(false)
  useEffect(() => {
    if (!open || asked.current) return
    asked.current = true
    void actions
      .prefill()
      .then((found) => fill({ email: found.email ?? undefined, phone: found.phone ?? undefined }))
      .catch(() => undefined)
  }, [open, actions, fill])
}

function Sent({ copy, onClose }: { copy: InquiryCopy; onClose(): void }) {
  return (
    <div className="grid min-h-[min(440px,60dvh)] content-center justify-items-center gap-8 pt-6 pb-10">
      <span className="grid size-16 place-items-center rounded-full bg-success-tint text-success">
        <CheckIcon aria-hidden="true" className="size-8" strokeWidth={2.4} />
      </span>
      {/* The sheet's description shows the words; this tells a screen reader the send went through. */}
      <p role="status" className="sr-only">
        {copy.success.title} {copy.success.body}
      </p>
      <button type="button" onClick={onClose} className={cn(buttonVariants({ variant: 'cta-neutral', size: 'cta' }), 'md:w-60')}>
        {copy.success.close}
      </button>
    </div>
  )
}
