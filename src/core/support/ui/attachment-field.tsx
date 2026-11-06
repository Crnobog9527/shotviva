'use client'

import { useTranslations } from 'next-intl'

import { attachmentFor, type TicketType } from '../rules'
import type { Choice } from './form-state'

type Props = { type: TicketType; payments: readonly Choice[]; works: readonly Choice[] }

// The one optional (or, for refunds, required) attachment a type takes: one of the author's
// own payments or works. Nothing is uploaded (v1 has no attachments).
export function AttachmentField({ type, payments, works }: Props) {
  const t = useTranslations('app.support.new')
  const kind = attachmentFor(type)
  if (kind === 'none') return null
  if (kind === 'work') return <Picker name="jobId" label={t('workLabel')} choices={works} required={false} />
  const required = kind === 'payment-required'
  if (payments.length === 0) {
    return <p className="text-body text-muted-foreground">{t('noPayments')}</p>
  }
  return <Picker name="paymentId" label={t(required ? 'paymentLabel' : 'paymentOptional')} choices={payments} required={required} />
}

function Picker({ name, label, choices, required }: { name: string; label: string; choices: readonly Choice[]; required: boolean }) {
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
        defaultValue=""
        className="hairline-lit min-h-12 rounded-control bg-card px-3 text-body"
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
