'use client'

import { useActionState, useRef, useState, type ReactNode } from 'react'
import type { PartnerFormState } from './actions'

export type PartnerFormLabels = Record<Exclude<PartnerFormState, ''> | 'submit', string>

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
      {state && <p role="status">{labels[state]}</p>}
      <button className="af-button" disabled={pending}>
        {labels.submit}
      </button>
    </form>
  )
}

export function CopyLink({ url, copy, copied }: { url: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  return (
    <div className="af-copy">
      <input
        ref={field}
        value={url}
        readOnly
        aria-label={copy}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button
        type="button"
        className="af-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setDone(true)
          } catch {
            field.current?.select()
          }
        }}
      >
        {done ? copied : copy}
      </button>
    </div>
  )
}
