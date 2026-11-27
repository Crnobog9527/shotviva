'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'


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
  const offered = offeredPayments(type, payments)
  // 2033 (Owner 2026-11-28): org-pool purchases have no self-service refund; say so instead.
  const orgNote = offered.length < payments.length ? <p className="text-caption text-muted-foreground">{t('orgPoolNoRefund')}</p> : null
  if (offered.length === 0) {
    return orgNote ?? <p className="text-body text-muted-foreground">{t('noPayments')}</p>
  }
  return (
    <div className="grid gap-2">
      <Picker name="paymentId" label={t(required ? 'paymentLabel' : 'paymentOptional')} choices={offered} required={required} />
      {orgNote}
    </div>
  )
}

// The payments a type's picker offers: a refund request leaves out those with no self-service
// refund (org-pool purchases, 2033); billing tickets offer every payment.
export function offeredPayments(type: TicketType, payments: readonly Choice[]): readonly Choice[] {
  return type === 'refund' ? payments.filter((choice) => !choice.noRefund) : payments
}

type PickerProps = { name: string; label: string; choices: readonly Choice[]; required: boolean; initial?: string; onPick?(value: string): void }

// The picked work's reference number (T78) under the picker: on a phone the option text is cut
// before the number, and it is what the Owner looks the work up by.
function WorkPicker({ label, works, initial }: { label: string; works: readonly Choice[]; initial: string }) {
  const t = useTranslations('app.support.new')
  const [picked, setPicked] = useState(initial)
  const ref = works.find((choice) => choice.value === picked)?.ref
  return (
    <div className="grid gap-2">
      <Picker name="jobId" label={label} choices={works} required={false} initial={initial} onPick={setPicked} />
      {ref ? <p className="font-mono text-caption text-muted-foreground">{t('workRef', { ref })}</p> : null}
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
