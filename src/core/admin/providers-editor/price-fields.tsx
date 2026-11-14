'use client'

import { catalogTokenPrices, type CatalogPricing } from '@/core/templates/catalog-pricing'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { PROVIDERS_COPY } from './copy'
import { MODULE_PRICE_FIELDS, priceOrigin, type PriceField, type PriceOrigin, type ProviderForm } from './form-state'

const COPY = PROVIDERS_COPY.form

type Props = { form: ProviderForm; catalogPricing?: CatalogPricing; onChange: (field: PriceField, value: string) => void }

function originText(origin: PriceOrigin): string | null {
  if (origin === null) return null
  if (origin.kind === 'official') return COPY.priceOfficial(origin.asOf)
  if (origin.kind === 'edited') return COPY.priceEdited(origin.asOf)
  return COPY.priceNoOfficial
}

function priceLabel(form: ProviderForm, field: PriceField): string {
  if (form.adapter === 'openrouter_images') return field === 'priceOutputPerM' ? COPY.routerOutput : COPY.routerInput
  return form.module === 'decision' && field === 'priceOutputPerM' ? COPY.priceTextOutputPerM : COPY[field]
}

// The module's per-million-token prices (T33): three for images, input / output for decisions. Free text so a half-typed decimal is not fought;
// Save stays disabled until each is blank or a non-negative number.
export function PriceFields({ form, onChange, catalogPricing }: Props) {
  const auto = catalogTokenPrices(catalogPricing)
  const placeholders: Partial<Record<PriceField, number | null>> = { priceInputTextPerM: auto.inputTextPerM, priceOutputPerM: auto.outputPerM }
  const origin = priceOrigin(form)
  const router = form.adapter === 'openrouter_images'
  const fields = MODULE_PRICE_FIELDS[router ? 'decision' : form.module]
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{router ? COPY.routerOverride : COPY.pricesTitle}</legend>
      <div className={`grid gap-2 ${fields.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {fields.map((field) => (
          <div key={field} className="grid gap-1">
            <Label htmlFor={`provider-${field}`} className="text-xs">
              {priceLabel(form, field)}
            </Label>
            <Input
              id={`provider-${field}`}
              inputMode="decimal"
              className="font-mono"
              placeholder={placeholders[field]?.toString()}
              value={form[field]}
              onChange={(event) => onChange(field, event.target.value)}
            />
          </div>
        ))}
      </div>
      {origin && !router ? (
        <p role="status" className={`text-xs ${origin.kind === 'none' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {originText(origin)}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{router ? COPY.routerPricesHint : COPY.pricesHint}</p>
    </fieldset>
  )
}
