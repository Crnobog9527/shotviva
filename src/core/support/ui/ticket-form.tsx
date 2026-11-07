'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'

import { ActionBar, ActionNotice } from '../../app-shell'
import { buttonVariants } from '../../ui/button'
import { attachmentFor, type TicketType } from '../rules'
import { AttachmentField } from './attachment-field'
import { BodyField } from './body-field'
import { dispatchKeeping } from './dispatch'
import { IDLE, type Choice, type FormAction } from './form-state'
import { TicketImagesField, useImagesText } from './ticket-images-field'
import { TypePicker } from './type-picker'

// A refund request on an account without payments cannot be sent; the field says so instead.
const cannotSend = (type: TicketType | null, payments: readonly Choice[]) =>
  type !== null && attachmentFor(type) === 'payment-required' && payments.length === 0

// The bar pinned to the bottom edge of the Help dialog's scrolling body (ResponsiveSheet `tall`
// has no bottom padding): full bleed over the body's 16 / 24px gutters.
export const DIALOG_FOOT = 'sticky bottom-0 z-10 -mx-4 mt-2 md:-mx-6'

// job: a work sent along from its photo page (T78), which starts the form as an image issue
// with that work picked.
type Props = { submit: FormAction; payments: readonly Choice[]; works: readonly Choice[]; job?: string | null; onSent(ticketId: string): void }

// New ticket (the dialog's first tab): pick a type, optionally one's own payment or work,
// write up to 2,000 characters, add up to 3 images (T69). On success the dialog opens the new
// ticket.
export function TicketForm({ submit, payments, works, job = null, onSent }: Props) {
  const t = useTranslations('app.support.new')
  const [state, action, pending] = useActionState(submit, IDLE)
  const [type, setType] = useState<TicketType | null>(job ? 'image_issue' : null)
  // Picked images still uploading (or failed) hold the send back.
  const [imagesBusy, setImagesBusy] = useState(false)
  const imagesText = useImagesText()
  useEffect(() => {
    if (state.ticketId) onSent(state.ticketId)
  }, [state, onSent])
  const blocked = cannotSend(type, payments)
  return (
    <form onSubmit={(event) => dispatchKeeping(event, action)} className="grid grid-cols-[minmax(0,1fr)] gap-6 pt-5">
      <TypePicker value={type} onChange={setType} />
      {/* Keyed on the works too: a picked work shows once the list it belongs to has arrived. */}
      {type && <AttachmentField key={`${type}:${works.length}`} type={type} payments={payments} works={works} work={job} />}
      <BodyField
        id="ticket-body"
        label={t('bodyLabel')}
        placeholder={t('placeholder')}
        counter={(count, max) => t('counter', { count, max })}
      />
      <TicketImagesField text={imagesText} onBusyChange={setImagesBusy} />
      <ActionBar inline className={DIALOG_FOOT}>
        {state.error && <ActionNotice>{t(`errors.${state.error}`)}</ActionNotice>}
        <button
          type="submit"
          disabled={pending || type === null || blocked || imagesBusy}
          className={buttonVariants({ variant: 'cta', size: 'cta' })}
        >
          {t(pending ? 'submitting' : 'submit')}
        </button>
      </ActionBar>
    </form>
  )
}
