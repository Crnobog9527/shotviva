'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import { MODULE_ADAPTERS, type ProviderAdapterId, type ProviderModule } from '@/core/providers/types'

import type { AdminProvider, ProviderAdminActions } from '../providers/types'

import { PROVIDERS_COPY } from './copy'
import { canSave, formFor, tiersFor, usesTokenPrices, withBaseUrl, withAdapter, withModel, type ProviderForm } from './form-state'
import { CatalogPrices } from './catalog-prices'
import { ImageCostFields } from './image-cost-fields'
import { PriceFields } from './price-fields'
import { useModelResolutions } from './use-model-resolutions'

type Props = {
  // null for a new provider, which joins `module`'s section.
  provider: AdminProvider | null
  module: ProviderModule
  pending: boolean
  error: string | null
  lookupModel: ProviderAdminActions['lookupModel']
  onCancel: () => void
  onSubmit: (form: ProviderForm) => void
}

type FieldProps = { id: keyof ProviderForm; label: string; hint?: string; children: React.ReactNode }

function Field({ id, label, hint, children }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`provider-${id}`}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}

// Mounted fresh per target (keyed by the container), so initial state comes from props. The key
// input is a new-password field (no autofill of a saved login), never filled from the server.
const COPY = PROVIDERS_COPY.form

function useFormState(provider: AdminProvider | null, module: ProviderModule, lookupModel: Props['lookupModel']) {
  const [draft, setForm] = useState(() => formFor(provider, module))
  const catalog = useModelResolutions(draft.adapter === 'openrouter_images', draft.baseUrl.trim(), draft.model.trim(), lookupModel)
  const tiers = catalog.snapshot?.resolutions ?? draft.resolutions
  const form = { ...draft, resolutions: draft.adapter === 'openrouter_images' ? tiers : [...tiersFor(draft.adapter)] }
  const canSubmit = !catalog.pending && catalog.result?.ok !== false && canSave(form, !provider?.apiKeyLast4)
  return { form, setForm, catalog, canSubmit, estimates: catalog.snapshot?.catalogImageCosts }
}

function LookupStatus({ catalog }: { catalog: ReturnType<typeof useModelResolutions> }) {
  if (catalog.pending) return <p role="status" className="text-muted-foreground text-xs">{COPY.lookupPending}</p>
  if (!catalog.result || catalog.result.ok) return null
  const reason = catalog.result.reason
  return (
    <div role="alert" className="text-destructive text-sm">
      {PROVIDERS_COPY.errors[reason]}
      {reason === 'openrouter_catalog_unavailable' && <Button variant="link" onClick={catalog.retry}>{COPY.retryLookup}</Button>}
    </div>
  )
}

function CatalogPreview({ catalog }: { catalog: ReturnType<typeof useModelResolutions> }) {
  const snapshot = catalog.snapshot
  if (!snapshot) return null
  return <div className="grid gap-1">
    <Label>{COPY.catalogPrices}</Label>
    <CatalogPrices pricing={snapshot.catalogPricing} />
    {snapshot.catalogPricing?.status === 'unavailable' && <Button variant="link" onClick={catalog.retry}>{COPY.retryLookup}</Button>}
  </div>
}

function modelHint(form: ProviderForm) {
  if (form.adapter === 'openrouter_images') return COPY.routerModelHint
  if (form.adapter === 'ark_images') return COPY.arkModelHint
  return PROVIDERS_COPY.modules[form.module].modelHint
}

type PricesProps = {
  form: ProviderForm
  catalog: ReturnType<typeof useModelResolutions>
  setForm: React.Dispatch<React.SetStateAction<ProviderForm>>
}

// Token prices, or for Ark (billed per image from the code table) a note instead.
function Prices({ form, catalog, setForm }: PricesProps) {
  if (!usesTokenPrices(form)) return <p className="text-muted-foreground text-xs">{COPY.arkPrices}</p>
  return <PriceFields form={form} catalogPricing={catalog.snapshot?.catalogPricing} onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))} />
}

export function ProviderFormDialog({ provider, module, pending, error, lookupModel, onCancel, onSubmit }: Props) {
  const { form, setForm, catalog, canSubmit, estimates } = useFormState(provider, module, lookupModel)
  const set = (key: keyof ProviderForm) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  // The model drives the official-price pre-fill (§10.0).
  const setModel = (event: { target: { value: string } }) => setForm((prev) => withModel(prev, event.target.value))
  const input = (key: 'label' | 'baseUrl' | 'model', mono = false) => (
    <Input id={`provider-${key}`} className={mono ? 'font-mono' : undefined} value={form[key]} onChange={key === 'model' ? setModel : key === 'baseUrl' ? e => setForm(prev => withBaseUrl(prev, e.target.value)) : set(key)} />
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider ? COPY.titleEdit(provider.label) : COPY.titleNew}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field id="label" label={COPY.label} hint={COPY.labelHint}>
            {input('label')}
          </Field>
          <Field id="adapter" label={COPY.adapter} hint={COPY.adapterHint[form.adapter]}>
            <select id="provider-adapter" className="border-input h-9 rounded-md border px-3 text-sm"
              value={form.adapter} disabled={provider !== null || form.module === 'decision'}
              onChange={(event) => setForm(withAdapter(form, event.target.value as ProviderAdapterId))}>
              {MODULE_ADAPTERS[form.module].map((id) => <option key={id} value={id}>{PROVIDERS_COPY.adapters[id]}</option>)}
            </select>
          </Field>
          <Field id="baseUrl" label={COPY.baseUrl} hint={COPY.baseUrlHint}>
            {input('baseUrl', true)}
          </Field>
          <Field id="model" label={COPY.model} hint={modelHint(form)}>
            {input('model', true)}
          </Field>
          <LookupStatus catalog={catalog} />
          <CatalogPreview catalog={catalog} />
          {form.module === 'image' && (
            <>
              <p className="text-sm">{COPY.resolutions} · {form.resolutions.join(' / ').toUpperCase()}</p>
              <ImageCostFields adapter={form.adapter} tiers={form.resolutions} values={form.imageCosts} estimates={estimates}
                onChange={(tier, value) => setForm((prev) => ({ ...prev, imageCosts: { ...prev.imageCosts, [tier]: value } }))} />
            </>
          )}
          <Field
            id="apiKey"
            label={COPY.apiKey}
            hint={provider ? COPY.apiKeyEditHint(provider.apiKeyLast4) : COPY.apiKeyNewHint}
          >
            <Input id="provider-apiKey" type="password" autoComplete="new-password" className="font-mono" value={form.apiKey} onChange={set('apiKey')} />
          </Field>
          <Prices form={form} catalog={catalog} setForm={setForm} />
          <Field id="notes" label={COPY.notes}>
            <Textarea id="provider-notes" maxLength={500} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {COPY.cancel}
          </Button>
          <Button disabled={pending || !canSubmit} onClick={() => onSubmit(form)}>
            {COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
