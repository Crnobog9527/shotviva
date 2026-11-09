'use client'

import { useActionState, useRef, startTransition, type FormEvent, type ReactNode } from 'react'
import { applyAction, type PartnerFormState } from './actions'
import type { PartnerFormLabels } from './interactive'

const draftKey = 'shotviva.affiliate.application'
const fields = ['name', 'country', 'channel', 'audience', 'plan'] as const

// Consent is always obtained from the signed-in user, never restored from a draft.
function saveDraft(values: FormData) {
  const answers = Object.fromEntries(fields.map((key) => [key, values.get(key)]))
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ parent: values.get('parent'), answers, expires: Date.now() + 30 * 60_000 }))
  } catch { /* The form also works without storage. */ }
}

function restoreDraft(form: HTMLFormElement, parent: string) {
  try {
    const raw = sessionStorage.getItem(draftKey)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (!(draft.expires > Date.now())) {
      sessionStorage.removeItem(draftKey)
      return
    }
    if (parent && draft.parent !== parent) return
    restoreValue(form, 'parent', draft.parent)
    for (const key of fields) restoreValue(form, key, draft.answers?.[key])
  } catch { /* An unavailable draft leaves the form usable. */ }
}

function restoreValue(form: HTMLFormElement, name: string, value: unknown) {
  const input = form.elements.namedItem(name)
  if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && typeof value === 'string') {
    input.value = value
  }
}

type Props = {
  parent: string; loginUrl?: string; successUrl: string; loginLabel: string; labels: PartnerFormLabels; children: ReactNode
}
export function ApplicationFields({ parent, loginUrl, successUrl, loginLabel, labels, children }: Props) {
  const restored = useRef(false)
  const [state, dispatch, pending] = useActionState(async (previous: PartnerFormState, data: FormData) => {
    const result = await applyAction(previous, data)
    if (result === 'saved') {
      try { sessionStorage.removeItem(draftKey) } catch { /* Storage may be disabled. */ }
      window.location.replace(successUrl)
    }
    return result
  }, '')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    saveDraft(data)
    if (loginUrl) window.location.assign(loginUrl)
    else startTransition(() => dispatch(data))
  }
  return (
    <form className="af-form" onSubmit={submit} onChange={(event) => saveDraft(new FormData(event.currentTarget))}
      ref={(form) => {
        if (form && !restored.current) {
          restoreDraft(form, parent)
          restored.current = true
        }
      }}>
      {children}
      {state && <p role="status">{labels[state]}</p>}
      <button className="af-button" type="submit" disabled={pending}>{loginUrl ? loginLabel : labels.submit}</button>
    </form>
  )
}
