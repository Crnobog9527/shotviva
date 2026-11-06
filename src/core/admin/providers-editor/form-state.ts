import type { ProviderPrices } from '@/core/jobs'
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
  // US dollars per million tokens (T33), as typed; blank means not filled in.
  priceInputTextPerM: string
  priceInputImagePerM: string
  priceOutputPerM: string
}

export const PRICE_FIELDS = ['priceInputTextPerM', 'priceInputImagePerM', 'priceOutputPerM'] as const
export type PriceField = (typeof PRICE_FIELDS)[number]

export const DEFAULT_FORM: ProviderForm = {
  module: 'image',
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

export function formFor(provider: AdminProvider | null, module: ProviderModule = 'image'): ProviderForm {
  if (!provider) return { ...DEFAULT_FORM, module }
  return {
    module: provider.module,
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

// The prices each module's jobs are costed with. The decision step (T30) is billed as input and
// output tokens only: its preview image counts as input tokens, so it has no image price.
export const MODULE_PRICE_FIELDS: Record<ProviderModule, readonly PriceField[]> = {
  image: PRICE_FIELDS,
  decision: ['priceInputTextPerM', 'priceOutputPerM'],
}

const PRICE_OF = { priceInputTextPerM: 'inputTextPerM', priceInputImagePerM: 'inputImagePerM', priceOutputPerM: 'outputPerM' } as const

// A provider without the prices its module needs cannot cost its jobs; the list flags it (T33).
export function missingPrices(prices: ProviderPrices, module: ProviderModule = 'image'): boolean {
  return MODULE_PRICE_FIELDS[module].some((field) => prices[PRICE_OF[field]] === null)
}

// Blank or a non-negative decimal; anything else keeps Save disabled.
const PRICE_PATTERN = /^\s*(\d+(\.\d+)?)?\s*$/

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
