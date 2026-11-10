'use client'

import { useActionState, startTransition, type FormEvent, type ReactNode } from 'react'
import { applyAction, type PartnerFormState } from './actions'
import type { PartnerFormLabels } from './interactive'

type Props = { canSubmit: boolean; successUrl: string; labels: PartnerFormLabels; children: ReactNode }

export function ApplicationFields({ canSubmit, successUrl, labels, children }: Props) {
  const [state, dispatch, pending] = useActionState(async (previous: PartnerFormState, data: FormData) => {
    const result = await applyAction(previous, data)
    if (result === 'saved') window.location.replace(successUrl)
    return result
  }, '')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) startTransition(() => dispatch(new FormData(event.currentTarget)))
  }
  return (
    <form className="af-form" onSubmit={submit}>
      {children}
      {state && state !== 'saved' && <p className="af-error" role="alert">{labels[state]}</p>}
      {canSubmit && (
        <button className="af-button af-button-block" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? labels.saving : labels.submit}
        </button>
      )}
    </form>
  )
}
