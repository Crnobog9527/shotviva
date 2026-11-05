import type { AdminProvider, SaveProviderInput } from '../providers/types'

// The provider form's local state. The key field always starts blank: the browser never has
// the stored key, and blank means "keep it" on an edit.
export type ProviderForm = {
  label: string
  baseUrl: string
  model: string
  apiKey: string
  notes: string
}

export const DEFAULT_FORM: ProviderForm = {
  label: '',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  notes: '',
}

export function formFor(provider: AdminProvider | null): ProviderForm {
  if (!provider) return DEFAULT_FORM
  return { label: provider.label, baseUrl: provider.baseUrl, model: provider.model, apiKey: '', notes: provider.notes ?? '' }
}

export function toSaveInput(form: ProviderForm, provider: AdminProvider | null): SaveProviderInput {
  return {
    ...(provider ? { id: provider.id } : {}),
    module: 'image',
    adapter: 'openai_images',
    label: form.label,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey,
    notes: form.notes,
  }
}

// Save stays disabled until the required fields are filled; the server validates again.
export function canSave(form: ProviderForm, isNew: boolean): boolean {
  const filled = [form.label, form.baseUrl, form.model].every((value) => value.trim() !== '')
  return filled && (!isNew || form.apiKey.trim() !== '')
}
