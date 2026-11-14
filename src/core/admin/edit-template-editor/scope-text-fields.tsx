'use client'

import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import { EDIT_TEMPLATE_COPY as COPY } from './copy'

type Props<S extends string> = {
  legend: string
  idPrefix: string
  scopes: readonly S[]
  values: Record<S, string>
  onChange: (scope: S, value: string) => void
}

// One labelled text box per range, for the six constraint paragraphs.
export function ScopeTextFields<S extends keyof typeof COPY.scopes>({ legend, idPrefix, scopes, values, onChange }: Props<S>) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-dashed p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {scopes.map((scope) => (
        <div key={scope} className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-${scope}`}>{COPY.scopes[scope]}</Label>
          <Textarea
            id={`${idPrefix}-${scope}`}
            className="min-h-20 font-mono text-xs"
            value={values[scope]}
            onChange={(event) => onChange(scope, event.target.value)}
          />
        </div>
      ))}
    </fieldset>
  )
}
