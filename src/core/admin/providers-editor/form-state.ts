import { MODULE_ADAPTER, type ProviderModule } from '@/core/providers/types'

import type { AdminProvider, SaveProviderInput } from '../providers/types'

// The provider form's local state. The key field always starts blank: the browser never has
// the stored key, and blank means "keep it" on an edit.
export type ProviderForm = {
  // Fixed per row: a new one takes the section it was added from.
  module: ProviderModule
  label: string
  baseUrl: string
  model: string
  apiKey: string
  notes: string
}

export const DEFAULT_FORM: ProviderForm = {
  module: 'image',
  label: '',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  notes: '',
}

export function formFor(provider: AdminProvider | null, module: ProviderModule = 'image'): ProviderForm {
  if (!provider) return { ...DEFAULT_FORM, module }
  return { module: provider.module, label: provider.label, baseUrl: provider.baseUrl, model: provider.model, apiKey: '', notes: provider.notes ?? '' }
}

export function toSaveInput(form: ProviderForm, provider: AdminProvider | null): SaveProviderInput {
  return {
    ...(provider ? { id: provider.id } : {}),
    module: form.module,
    adapter: MODULE_ADAPTER[form.module],
    label: form.label,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey,
    notes: form.notes,
  }
}

// Save stays disabled until the required fields are filled; the server validates again. A key
// is required for a new row and for a row that has none.
export function canSave(form: ProviderForm, needsKey: boolean): boolean {
  const filled = [form.label, form.baseUrl, form.model].every((value) => value.trim() !== '')
  return filled && (!needsKey || form.apiKey.trim() !== '')
}
