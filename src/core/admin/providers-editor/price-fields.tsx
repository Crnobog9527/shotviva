'use client'

import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { PROVIDERS_COPY } from './copy'
import { MODULE_PRICE_FIELDS, priceOrigin, type PriceField, type PriceOrigin, type ProviderForm } from './form-state'

const COPY = PROVIDERS_COPY.form

type Props = { form: ProviderForm; onChange: (field: PriceField, value: string) => void }

function originText(origin: PriceOrigin): string | null {
  if (origin === null) return null
  if (origin.kind === 'official') return COPY.priceOfficial(origin.asOf)
  if (origin.kind === 'edited') return COPY.priceEdited(origin.asOf)
  return COPY.priceNoOfficial
}

// The module's per-million-token prices (T33): three for images, input / output for decisions. Free text so a half-typed decimal is not fought;
// Save stays disabled until each is blank or a non-negative number.
export function PriceFields({ form, onChange }: Props) {
  const origin = priceOrigin(form)
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{COPY.pricesTitle}</legend>
      <div className={`grid gap-2 ${form.module === 'image' ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {MODULE_PRICE_FIELDS[form.module].map((field) => (
          <div key={field} className="grid gap-1">
            <Label htmlFor={`provider-${field}`} className="text-xs">
              {form.module === 'decision' && field === 'priceOutputPerM' ? COPY.priceTextOutputPerM : COPY[field]}
            </Label>
            <Input
              id={`provider-${field}`}
              inputMode="decimal"
              className="font-mono"
              value={form[field]}
              onChange={(event) => onChange(field, event.target.value)}
            />
          </div>
        ))}
      </div>
      {origin ? (
        <p role="status" className={`text-xs ${origin.kind === 'none' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {originText(origin)}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{COPY.pricesHint}</p>
    </fieldset>
  )
}
