'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { ActionBar, ActionNotice } from '../../app-shell'
import { buttonVariants } from '../../ui/button'
import { attachmentFor, type TicketType } from '../rules'
import { AttachmentField } from './attachment-field'
import { BodyField } from './body-field'
import { dispatchKeeping } from './dispatch'
import { IDLE, type Choice, type FormAction } from './form-state'
import { TypePicker } from './type-picker'

type Props = { submit: FormAction; payments: readonly Choice[]; works: readonly Choice[] }

// New request (a flow page): pick a type, optionally one's own payment or work, write up to
// 2,000 characters. The server action redirects to the new ticket on success.
export function TicketForm({ submit, payments, works }: Props) {
  const t = useTranslations('app.support.new')
  const [state, action, pending] = useActionState(submit, IDLE)
  const [type, setType] = useState<TicketType | null>(null)
  // A refund request on an account without payments cannot be sent; say so instead.
  const blocked = type !== null && attachmentFor(type) === 'payment-required' && payments.length === 0
  return (
    <form onSubmit={(event) => dispatchKeeping(event, action)} className="grid gap-6 px-4 pt-4 pb-32">
      <TypePicker value={type} onChange={setType} />
      {type && <AttachmentField key={type} type={type} payments={payments} works={works} />}
      <BodyField
        id="ticket-body"
        label={t('bodyLabel')}
        placeholder={t('placeholder')}
        counter={(count, max) => t('counter', { count, max })}
      />
      <ActionBar>
        {state.error && <ActionNotice>{t(`errors.${state.error}`)}</ActionNotice>}
        <button
          type="submit"
          disabled={pending || type === null || blocked}
          className={buttonVariants({ variant: 'cta', size: 'cta' })}
        >
          {t(pending ? 'submitting' : 'submit')}
        </button>
      </ActionBar>
    </form>
  )
}
