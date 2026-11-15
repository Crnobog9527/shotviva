'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { PROVIDERS_COPY } from './copy'
import { arkPriceComplete, type ProviderForm } from './form-state'

const COPY = PROVIDERS_COPY.form

type ArkField = 'arkOutputCny' | 'arkSplitMp' | 'arkOutputCnyAbove' | 'arkInputCny' | 'arkSource' | 'arkAsOf'

// An Ark line's list price (1566), typed in from Ark's own price page: Ark has no public price
// catalogue to read. Required before a save, with the page's URL and the date it was read.
export function ArkPriceFields({ form, onChange }: { form: ProviderForm; onChange: (field: ArkField, value: string) => void }) {
  const input = (field: ArkField, mode: 'decimal' | 'url' | 'text' = 'decimal') => (
    <div className="grid gap-1">
      <Label htmlFor={`provider-${field}`} className="text-xs">{COPY[field]}</Label>
      <Input id={`provider-${field}`} inputMode={mode} className="font-mono" value={form[field]} onChange={(e) => onChange(field, e.target.value)} />
    </div>
  )
  const complete = arkPriceComplete(form)
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{COPY.arkPricesTitle}</legend>
      <div className="grid grid-cols-2 gap-2">
        {input('arkOutputCny')}
        {input('arkInputCny')}
        {input('arkSplitMp')}
        {form.arkSplitMp.trim() ? input('arkOutputCnyAbove') : null}
      </div>
      {input('arkSource', 'url')}
      {input('arkAsOf', 'text')}
      <p className="text-muted-foreground text-xs">{COPY.arkPricesHint}</p>
      {complete ? null : <p role="status" className="text-destructive text-xs">{COPY.arkPriceRequired}</p>}
    </fieldset>
  )
}
