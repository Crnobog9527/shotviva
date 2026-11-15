'use client'

import type { CatalogPrice } from '@/core/jobs/catalog-price'
import { catalogTokenPrices, type CatalogPricing } from '@/core/templates/catalog-pricing'
import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'

import { isTextModule } from '@/core/providers/types'

import { PROVIDERS_COPY } from './copy'
import { catalogFields, catalogText, MODULE_PRICE_FIELDS, priceOrigin, type PriceField, type PriceOrigin, type ProviderForm } from './form-state'

const COPY = PROVIDERS_COPY.form

// The live catalogue price for a non-router line (§10.0): what it is, whether it settled, and a retry.
export type LivePrice = { price: CatalogPrice | null; lookedUp: boolean; failed: boolean; retry: () => void }

type Props = { form: ProviderForm; catalogPricing?: CatalogPricing; live?: LivePrice; onChange: (field: PriceField, value: string) => void }

const day = (iso: string) => iso.slice(0, 10)

function originText(origin: NonNullable<PriceOrigin>, failed: boolean): string {
  if (origin.kind === 'catalog') return COPY.priceCatalog(day(origin.price.fetchedAt), origin.price.source)
  if (failed) return COPY.priceLookupFailed
  return origin.reason === 'missing' ? COPY.priceCatalogMissing : COPY.priceNoCatalog
}

function priceLabel(form: ProviderForm, field: PriceField): string {
  if (form.adapter === 'openrouter_images') return field === 'priceOutputPerM' ? COPY.routerOutput : COPY.routerInput
  return isTextModule(form.module) && field === 'priceOutputPerM' ? COPY.priceTextOutputPerM : COPY[field]
}

function PriceInput({ form, field, catalog, placeholder, live, onChange }: {
  form: ProviderForm; field: PriceField; catalog: boolean; placeholder?: string; live?: LivePrice; onChange: Props['onChange']
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={`provider-${field}`} className="text-xs">
        {priceLabel(form, field)}
      </Label>
      <Input
        id={`provider-${field}`}
        inputMode="decimal"
        className="font-mono"
        placeholder={placeholder}
        readOnly={catalog}
        aria-readonly={catalog}
        value={catalog ? catalogText(live?.price, field) : form[field]}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </div>
  )
}

function Origin({ origin, live }: { origin: PriceOrigin; live?: LivePrice }) {
  if (!origin) return null
  const failed = live?.failed ?? false
  return (
    <p role="status" className={`text-xs ${origin.kind === 'manual' ? 'text-destructive' : 'text-muted-foreground'}`}>
      {originText(origin, failed)}
      {failed && live ? <Button variant="link" className="h-auto p-0 pl-1 text-xs" onClick={live.retry}>{COPY.retryLookup}</Button> : null}
    </p>
  )
}

// The router line's optional token estimate overrides, with the catalogue estimate as placeholder.
function routerPlaceholders(catalogPricing?: CatalogPricing): Partial<Record<PriceField, string>> {
  const auto = catalogTokenPrices(catalogPricing)
  return { priceInputTextPerM: auto.inputTextPerM?.toString(), priceOutputPerM: auto.outputPerM?.toString() }
}

// The module's per-million-token prices (T33): three for images, input / output for text lines.
// A field the OpenRouter catalogue prices shows that price read-only, with its source and date; the
// others are typed in from the provider's own price page. Free text so a half-typed decimal is not
// fought; Save stays disabled until each is blank or a non-negative number.
function fieldsView(form: ProviderForm, catalogPricing: CatalogPricing | undefined, live: LivePrice | undefined) {
  if (form.adapter === 'openrouter_images') {
    return { placeholders: routerPlaceholders(catalogPricing), fromCatalog: [] as PriceField[], origin: null, fields: MODULE_PRICE_FIELDS.decision, legend: COPY.routerOverride, hint: COPY.routerPricesHint }
  }
  return {
    placeholders: {} as Partial<Record<PriceField, string>>, fromCatalog: catalogFields(form, live?.price),
    origin: priceOrigin(form, live?.price, live?.lookedUp ?? true), fields: MODULE_PRICE_FIELDS[form.module], legend: COPY.pricesTitle, hint: COPY.pricesHint,
  }
}

export function PriceFields({ form, onChange, catalogPricing, live }: Props) {
  const view = fieldsView(form, catalogPricing, live)
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{view.legend}</legend>
      <div className={`grid gap-2 ${view.fields.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {view.fields.map((field) => (
          <PriceInput key={field} form={form} field={field} catalog={view.fromCatalog.includes(field)} placeholder={view.placeholders[field]} live={live} onChange={onChange} />
        ))}
      </div>
      <Origin origin={view.origin} live={live} />
      <p className="text-muted-foreground text-xs">{view.hint}</p>
    </fieldset>
  )
}
