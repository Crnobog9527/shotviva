'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useState } from 'react'

import { buttonVariants } from '../../ui/button'
import { BodyField } from './body-field'
import { dispatchKeeping } from './dispatch'
import { IDLE, type FormAction } from './form-state'
import { TicketImagesField, useImagesText } from './ticket-images-field'

type Props = { send: FormAction; closed: boolean; onSent(): void }

// "Add to this ticket": the action is already bound to the ticket. After a send the dialog
// reloads the thread, and the field and images start empty again (keyed on the send).
export function AddMessageForm({ send, closed, onSent }: Props) {
  const t = useTranslations('app.support.thread')
  const counter = useTranslations('app.support.new')
  const [state, action, pending] = useActionState(send, IDLE)
  const [imagesBusy, setImagesBusy] = useState(false)
  const imagesText = useImagesText()
  useEffect(() => {
    if (state.sentAt) onSent()
  }, [state, onSent])
  return (
    <form onSubmit={(event) => dispatchKeeping(event, action)} className="grid gap-3">
      {closed && <p className="text-caption text-muted-foreground">{t('closedNote')}</p>}
      <BodyField
        key={state.sentAt ?? 0}
        id="ticket-reply"
        label={t('addLabel')}
        counter={(count, max) => counter('counter', { count, max })}
      />
      <TicketImagesField key={`images-${state.sentAt ?? 0}`} text={imagesText} onBusyChange={setImagesBusy} />
      {state.error && (
        <p role="alert" className="text-caption text-destructive">
          {t(`errors.${state.error === 'RATE_LIMITED' ? 'generic' : state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending || imagesBusy} className={buttonVariants({ variant: 'glass', size: 'touch', className: 'justify-self-end' })}>
        {t(pending ? 'adding' : 'add')}
      </button>
    </form>
  )
}
