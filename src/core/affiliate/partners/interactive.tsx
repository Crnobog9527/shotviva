'use client'

import { useActionState, type ReactNode } from 'react'
import type { PartnerFormState } from './actions'

export type PartnerFormLabels = Record<Exclude<PartnerFormState, ''> | 'submit' | 'saving', string>

export function PartnerForm({
  action,
  labels,
  children,
}: {
  action: (state: PartnerFormState, data: FormData) => Promise<PartnerFormState>
  labels: PartnerFormLabels
  children: ReactNode
}) {
  const [state, submit, pending] = useActionState(action, '')
  return (
    <form action={submit} className="af-form">
      {children}
      {state && <p className={state === 'saved' ? 'af-success' : 'af-error'} role="status">{labels[state]}</p>}
      <button className="af-button af-button-block" disabled={pending} aria-busy={pending}>
        {pending ? labels.saving : labels.submit}
      </button>
    </form>
  )
}
