'use client'

import { PROVIDERS_COPY } from './copy'
import { byokApplies, type ProviderForm } from './form-state'

const COPY = PROVIDERS_COPY.form

type Props = { form: ProviderForm; onChange: (on: boolean) => void }

// 「BYOK（按官方价）」 (1551), on by default for an OpenRouter openai/gpt-image-* line.
export function ByokField({ form, onChange }: Props) {
  if (!byokApplies(form)) return null
  return (
    <div className="grid gap-1.5">
      <label htmlFor="provider-byokListPrice" className="flex items-center gap-2 text-sm font-medium">
        <input id="provider-byokListPrice" type="checkbox" checked={form.byokListPrice}
          onChange={(event) => onChange(event.target.checked)} />
        {COPY.byokListPrice}
      </label>
      <p className="text-muted-foreground text-xs">{COPY.byokListPriceHint}</p>
    </div>
  )
}
