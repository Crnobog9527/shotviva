'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { jobRef } from '../../jobs/ref'
import { attachmentFor, type TicketType } from '../rules'
import type { Choice } from './form-state'

// work: the work to start with (T78, from the photo page), when it is among `works`.
type Props = { type: TicketType; payments: readonly Choice[]; works: readonly Choice[]; work?: string | null }

// The one optional (or, for refunds, required) attachment a type takes: one of the author's
// own payments or works. Nothing is uploaded (v1 has no attachments).
export function AttachmentField({ type, payments, works, work = null }: Props) {
  const t = useTranslations('app.support.new')
  const kind = attachmentFor(type)
  if (kind === 'none') return null
  if (kind === 'work') {
    const picked = work && works.some((choice) => choice.value === work) ? work : ''
    return <WorkPicker label={t('workLabel')} works={works} initial={picked} />
  }
  const required = kind === 'payment-required'
  if (payments.length === 0) {
    return <p className="text-body text-muted-foreground">{t('noPayments')}</p>
  }
  return <Picker name="paymentId" label={t(required ? 'paymentLabel' : 'paymentOptional')} choices={payments} required={required} />
}

type PickerProps = { name: string; label: string; choices: readonly Choice[]; required: boolean; initial?: string; onPick?(value: string): void }

// The picked work's reference number (T78) under the picker: on a phone the option text is cut
// before the number, and it is what the Owner looks the work up by.
function WorkPicker({ label, works, initial }: { label: string; works: readonly Choice[]; initial: string }) {
  const t = useTranslations('app.support.new')
  const [picked, setPicked] = useState(initial)
  return (
    <div className="grid gap-2">
      <Picker name="jobId" label={label} choices={works} required={false} initial={initial} onPick={setPicked} />
      {picked ? <p className="font-mono text-caption text-muted-foreground">{t('workRef', { ref: jobRef(picked) })}</p> : null}
    </div>
  )
}

function Picker({ name, label, choices, required, initial = '', onPick }: PickerProps) {
  const t = useTranslations('app.support.new')
  return (
    <div className="grid gap-2">
      <label htmlFor={`ticket-${name}`} className="text-headline font-semibold">
        {label}
      </label>
      <select
        id={`ticket-${name}`}
        name={name}
        required={required}
        defaultValue={initial}
        onChange={onPick ? (event) => onPick(event.target.value) : undefined}
        className="hairline-lit min-h-12 w-full min-w-0 truncate rounded-control bg-card px-3 text-body"
      >
        <option value="">{required ? t('choose') : t('none')}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  )
}
