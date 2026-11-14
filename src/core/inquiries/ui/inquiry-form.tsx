'use client'

import { CheckIcon, CircleAlertIcon } from 'lucide-react'

import { ActionBar } from '../../app-shell'
import { buttonVariants } from '../../ui/button'
import { cn } from '../../ui/cn'
import type { InquiryCopy } from './copy'
import { FieldNote } from './field-parts'
import { CompanySection, ContactSection, NeedsSection } from './inquiry-sections'
import type { InquiryForm as Form } from './use-inquiry-form'

// The bar pinned to the bottom edge of the dialog's scrolling body (ResponsiveSheet `tall` has no
// bottom padding): full bleed over the body's 16 / 24px gutters, like Help & feedback's.
const DIALOG_FOOT = 'sticky bottom-0 z-10 -mx-4 mt-2 md:-mx-6'

type Props = { form: Form; copy: InquiryCopy }

// The whole form: three sections, the privacy box, then Send in the bar at the bottom edge.
export function InquiryFormView({ form, copy }: Props) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        form.send()
      }}
      className="grid grid-cols-[minmax(0,1fr)] gap-7 pt-6"
    >
      <ContactSection form={form} copy={copy} />
      <CompanySection form={form} copy={copy} />
      <NeedsSection form={form} copy={copy} />
      <ConsentField form={form} copy={copy} />
      <SendBar form={form} copy={copy} />
    </form>
  )
}

// The required privacy box, drawn like the sign-up terms box (auth.css .au-check).
function ConsentField({ form, copy }: Props) {
  const error = form.errors.consent ? copy.errors.consent : null
  const { before, link, after } = copy.consent
  return (
    <div className="grid gap-2 border-t border-border pt-5">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-caption leading-[1.55] text-bone-dim">
        <input
          id="iq-consent"
          type="checkbox"
          checked={form.values.consent}
          onChange={(event) => form.set('consent', event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'iq-consent-note' : undefined}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[22px] flex-none place-content-center rounded-[7px] transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
            form.values.consent
              ? 'bg-primary text-primary-foreground'
              : cn('bg-wash-faint shadow-[inset_0_0_0_1.5px_var(--input)]', error && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]'),
          )}
        >
          {form.values.consent ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <span>
          {before}
          <a href={link.href} target="_blank" rel="noopener" className="text-foreground underline decoration-input underline-offset-[3px]">
            {link.text}
          </a>
          {after}
        </span>
      </label>
      <FieldNote id="iq-consent-note" error={error} />
    </div>
  )
}

function SendBar({ form, copy }: Props) {
  const stillWrong = form.failed === 'checkFields' && Object.keys(form.errors).length > 0
  const notice = form.failed === 'checkFields' ? (stillWrong ? copy.checkFields : null) : form.failed ? copy.failed[form.failed] : null
  return (
    <ActionBar inline className={DIALOG_FOOT}>
      {notice ? (
        <p role="alert" className="mb-3 flex items-start gap-2 text-caption leading-[1.4] text-destructive">
          <CircleAlertIcon aria-hidden="true" className="mt-px size-4 flex-none" strokeWidth={2} />
          <span>{notice}</span>
        </p>
      ) : null}
      <button type="submit" disabled={form.pending} aria-busy={form.pending || undefined} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        {form.pending ? copy.submitting : copy.submit}
      </button>
    </ActionBar>
  )
}
