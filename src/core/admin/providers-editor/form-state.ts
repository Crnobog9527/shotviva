import type { ProviderPrices } from '@/core/jobs'

import type { AdminProvider, SaveProviderInput } from '../providers/types'

// The provider form's local state. The key field always starts blank: the browser never has
// the stored key, and blank means "keep it" on an edit.
export type ProviderForm = {
  label: string
  baseUrl: string
  model: string
  apiKey: string
  notes: string
  // US dollars per million tokens (T33), as typed; blank means not filled in.
  priceInputTextPerM: string
  priceInputImagePerM: string
  priceOutputPerM: string
}

export const PRICE_FIELDS = ['priceInputTextPerM', 'priceInputImagePerM', 'priceOutputPerM'] as const
export type PriceField = (typeof PRICE_FIELDS)[number]

export const DEFAULT_FORM: ProviderForm = {
  label: '',
  baseUrl: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  notes: '',
  priceInputTextPerM: '',
  priceInputImagePerM: '',
  priceOutputPerM: '',
}

const priceText = (value: number | null) => (value === null ? '' : String(value))

export function formFor(provider: AdminProvider | null): ProviderForm {
  if (!provider) return DEFAULT_FORM
  return {
    label: provider.label,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: '',
    notes: provider.notes ?? '',
    priceInputTextPerM: priceText(provider.prices.inputTextPerM),
    priceInputImagePerM: priceText(provider.prices.inputImagePerM),
    priceOutputPerM: priceText(provider.prices.outputPerM),
  }
}

// A provider without all three prices cannot cost its jobs; the list flags it (T33).
export function missingPrices(prices: ProviderPrices): boolean {
  return prices.inputTextPerM === null || prices.inputImagePerM === null || prices.outputPerM === null
}

// Blank or a non-negative decimal; anything else keeps Save disabled.
const PRICE_PATTERN = /^\s*(\d+(\.\d+)?)?\s*$/

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
    priceInputTextPerM: form.priceInputTextPerM,
    priceInputImagePerM: form.priceInputImagePerM,
    priceOutputPerM: form.priceOutputPerM,
  }
}

// Save stays disabled until the required fields are filled; the server validates again. A key
// is required for a new row and for a row that has none.
export function canSave(form: ProviderForm, needsKey: boolean): boolean {
  const filled = [form.label, form.baseUrl, form.model].every((value) => value.trim() !== '')
  const pricesOk = PRICE_FIELDS.every((field) => PRICE_PATTERN.test(form[field]))
  return filled && pricesOk && (!needsKey || form.apiKey.trim() !== '')
}
