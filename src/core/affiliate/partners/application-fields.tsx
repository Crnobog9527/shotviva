'use client'

import { useRef, type FormEvent, type ReactNode } from 'react'
import { applyAction } from './actions'
import { PartnerForm } from './interactive'
import type { PartnerFormLabels } from './interactive'

const draftKey = 'shotviva.affiliate.application'
const fields = ['name', 'country', 'channel', 'audience', 'plan'] as const

// Keep the applicant's typed answers across sign-in in this tab. Terms must be accepted
// by the signed-in user, and eligibility is checked again before submission.
function saveDraft(form: HTMLFormElement, parent: string) {
  const values = new FormData(form)
  const answers = Object.fromEntries(fields.map((key) => [key, values.get(key)]))
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ parent, answers, expires: Date.now() + 30 * 60_000 }))
  } catch { /* Sign-in remains available with browser storage disabled. */ }
}

function restoreDraft(container: HTMLDivElement, parent: string) {
  try {
    const raw = sessionStorage.getItem(draftKey)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (!(draft.expires > Date.now())) {
      sessionStorage.removeItem(draftKey)
      return
    }
    if (draft.parent !== parent) return
    for (const key of fields) {
      const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${key}"]`)
      if (input && typeof draft.answers?.[key] === 'string') input.value = draft.answers[key]
    }
  } catch { /* A missing or expired draft leaves the form empty. */ }
}

type Props = { parent: string; loginUrl?: string; loginLabel: string; labels: PartnerFormLabels; children: ReactNode }
export function ApplicationFields({ parent, loginUrl, loginLabel, labels, children }: Props) {
  const restored = useRef(false)
  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveDraft(event.currentTarget, parent)
    if (loginUrl) window.location.assign(loginUrl)
  }
  if (loginUrl) return (
    <form className="af-form" onSubmit={signIn}>
      {children}
      <button className="af-button" type="submit">{loginLabel}</button>
    </form>
  )
  return (
    <div onSubmitCapture={() => {
      try { sessionStorage.removeItem(draftKey) } catch { /* Storage may be disabled. */ }
    }} ref={(node) => {
      if (node && !restored.current) {
        restoreDraft(node, parent)
        restored.current = true
      }
    }}>
      <PartnerForm action={applyAction} labels={labels}>{children}</PartnerForm>
    </div>
  )
}
