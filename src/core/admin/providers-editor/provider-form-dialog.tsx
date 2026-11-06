'use client'

import { useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'
import { Label } from '@/core/ui/label'
import { Textarea } from '@/core/ui/textarea'

import { MODULE_ADAPTER, type ProviderModule } from '@/core/providers/types'

import type { AdminProvider } from '../providers/types'

import { PROVIDERS_COPY } from './copy'
import { canSave, formFor, withModel, type ProviderForm } from './form-state'
import { PriceFields } from './price-fields'

type Props = {
  // null for a new provider, which joins `module`'s section.
  provider: AdminProvider | null
  module: ProviderModule
  pending: boolean
  error: string | null
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

export function ProviderFormDialog({ provider, module, pending, error, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState(() => formFor(provider, module))
  const adapter = MODULE_ADAPTER[form.module]
  const set = (key: keyof ProviderForm) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  // The model drives the official-price pre-fill (§10.0).
  const setModel = (event: { target: { value: string } }) => setForm((prev) => withModel(prev, event.target.value))
  const input = (key: 'label' | 'baseUrl' | 'model', mono = false) => (
    <Input id={`provider-${key}`} className={mono ? 'font-mono' : undefined} value={form[key]} onChange={key === 'model' ? setModel : set(key)} />
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
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">{COPY.adapter}</span>
            <p className="text-sm">
              {PROVIDERS_COPY.modules[form.module].title} · {PROVIDERS_COPY.adapters[adapter]}
            </p>
            <p className="text-muted-foreground text-xs">{COPY.adapterHint[adapter]}</p>
          </div>
          <Field id="baseUrl" label={COPY.baseUrl} hint={COPY.baseUrlHint}>
            {input('baseUrl', true)}
          </Field>
          <Field id="model" label={COPY.model} hint={PROVIDERS_COPY.modules[form.module].modelHint}>
            {input('model', true)}
          </Field>
          <Field
            id="apiKey"
            label={COPY.apiKey}
            hint={provider ? COPY.apiKeyEditHint(provider.apiKeyLast4) : COPY.apiKeyNewHint}
          >
            <Input id="provider-apiKey" type="password" autoComplete="new-password" className="font-mono" value={form.apiKey} onChange={set('apiKey')} />
          </Field>
          <PriceFields form={form} onChange={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))} />
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
          <Button disabled={pending || !canSave(form, provider === null || provider.apiKeyLast4 === null)} onClick={() => onSubmit(form)}>
            {COPY.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
