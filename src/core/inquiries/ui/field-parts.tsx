'use client'

import { CircleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// Shared pieces of the inquiry fields, drawn like the sign-in fields (auth.css `au-`): a 52px
// wash-faint control with an inset edge, a safelight focus halo, and the error under the field.

export const CONTROL =
  'w-full rounded-control bg-wash-faint px-3.5 text-body text-foreground shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-200 ' +
  'placeholder:text-muted-foreground focus:shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)] ' +
  'aria-invalid:shadow-[inset_0_0_0_1.5px_var(--destructive)] aria-invalid:focus:shadow-[inset_0_0_0_1.5px_var(--destructive),0_0_0_4px_color-mix(in_srgb,var(--destructive)_14%,transparent)]'

// The label line: the name, then "(optional)" in ash when the field can be left empty.
export function LabelText({ label, optional }: { label: string; optional?: string }) {
  return (
    <>
      <span className="font-medium">{label}</span>
      {optional ? <span className="ml-1.5 font-normal text-muted-foreground">{optional}</span> : null}
    </>
  )
}

// Under a field: the error when there is one (named for the screen reader by aria-describedby),
// otherwise the hint.
export function FieldNote({ id, error, hint, aside }: { id: string; error: string | null; hint?: string; aside?: ReactNode }) {
  if (!error && !hint && !aside) return null
  return (
    <div className="flex items-start justify-between gap-3">
      {error ? (
        <p id={id} className="flex items-start gap-1.5 text-caption leading-[1.4] text-destructive">
          <CircleAlertIcon aria-hidden="true" className="mt-px size-4 flex-none" strokeWidth={2} />
          {error}
        </p>
      ) : (
        <p id={id} className="text-caption leading-[1.4] text-muted-foreground">
          {hint}
        </p>
      )}
      {aside}
    </div>
  )
}
