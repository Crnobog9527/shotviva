import type { ProviderPrices } from '@/core/jobs'
import { effectivePrices, officialPrice } from '@/core/jobs/model-prices'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { ARK_RESOLUTIONS } from '@/core/providers/ark'
import { openAIImageTiers, UNKNOWN_MODEL_TIERS } from '@/core/providers/tier-support'
import { ARK_BASE_URL, DEFAULT_BASE_URL, MODULE_ADAPTER, OPENROUTER_BASE_URL, type ProviderAdapterId, type ProviderModule } from '@/core/providers/types'

import type { AdminProvider, SaveProviderInput } from '../providers/types'

// The provider form's local state. The key field always starts blank: the browser never has
// the stored key, and blank means "keep it" on an edit.
export type ProviderForm = {
  // Fixed per row: a new one takes the section it was added from.
  module: ProviderModule
  adapter: ProviderAdapterId
  // The tiers the admin keeps on (PR-1b): within what the model offers, or, for an OpenAI model
  // the table does not know, a declaration. `tiersTouchedFor` is the model the admin last ticked
  // tiers for, so changing the model never carries a choice over to another one.
  resolutions: Resolution[]
  tiersTouchedFor?: string | null
  imageCosts: Partial<Record<Resolution, string>>
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
  baseUrl: DEFAULT_BASE_URL,
  adapter: 'openai_images',
  resolutions: [...RESOLUTIONS],
  imageCosts: {},
  model: '',
  apiKey: '',
  notes: '',
  priceInputTextPerM: '',
  priceInputImagePerM: '',
  priceOutputPerM: '',
}

const priceText = (value: number | null) => (value === null ? '' : String(value))

export function formFor(provider: AdminProvider | null, module: ProviderModule = 'image'): ProviderForm {
  if (!provider) return { ...DEFAULT_FORM, module, adapter: MODULE_ADAPTER[module] }
  return fillOfficial({
    module: provider.module,
    adapter: provider.adapter,
    resolutions: provider.resolutions,
    imageCosts: Object.fromEntries(Object.entries(provider.estimatedImageCosts ?? {}).map(([tier, cost]) => [tier, String(cost)])),
    label: provider.label,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: '',
    notes: provider.notes ?? '',
    priceInputTextPerM: priceText(provider.prices.inputTextPerM),
    priceInputImagePerM: priceText(provider.prices.inputImagePerM),
    priceOutputPerM: priceText(provider.prices.outputPerM),
  })
}

// The prices each module's jobs are costed with. The decision step (T30) is billed as input and
// output tokens only: its preview image counts as input tokens, so it has no image price.
export const MODULE_PRICE_FIELDS: Record<ProviderModule, readonly PriceField[]> = {
  image: PRICE_FIELDS,
  decision: ['priceInputTextPerM', 'priceOutputPerM'],
}

const PRICE_OF = { priceInputTextPerM: 'inputTextPerM', priceInputImagePerM: 'inputImagePerM', priceOutputPerM: 'outputPerM' } as const

// A provider without the prices its module needs, in its row or in the price table for its
// model, cannot cost its jobs; the list flags it (T33, §10.0).
export function missingPrices(prices: ProviderPrices, module: ProviderModule = 'image', model = ''): boolean {
  const effective = effectivePrices(model, prices)
  return MODULE_PRICE_FIELDS[module].some((field) => (effective?.[PRICE_OF[field]] ?? null) === null)
}

// Fields the row leaves empty that the price table fills; the list says so.
export function pricesFromTable(prices: ProviderPrices, module: ProviderModule, model: string): string | null {
  const entry = officialPrice(model)
  if (!entry) return null
  const filled = MODULE_PRICE_FIELDS[module].some((field) => prices[PRICE_OF[field]] === null && entry.prices[PRICE_OF[field]] !== null)
  return filled ? entry.asOf : null
}

// The official price (MODEL_PRICES) for this form's model, as the form's text; '' where none.
function officialText(module: ProviderModule, model: string): Partial<Record<PriceField, string>> {
  const official = officialPrice(model)?.prices
  if (!official) return {}
  return Object.fromEntries(MODULE_PRICE_FIELDS[module].map((field) => [field, priceText(official[PRICE_OF[field]])]))
}

// Opening a row whose prices are blank: pre-fill them from the price table (§10.0).
function fillOfficial(form: ProviderForm): ProviderForm {
  if (form.adapter !== 'openai_images' && form.module === 'image') return form
  const official = officialText(form.module, form.model)
  const filled = { ...form }
  for (const field of MODULE_PRICE_FIELDS[form.module]) {
    if (filled[field].trim() === '' && official[field]) filled[field] = official[field]
  }
  return filled
}

// Typing a model name: a price field that is blank or still shows the previous model's official
// price follows the new model's (blank when the table has none). One the Owner typed stays.
export function withModel(form: ProviderForm, model: string): ProviderForm {
  if (form.adapter === 'openrouter_images' && model !== form.model) return { ...clearPrices(form), model }
  if (form.adapter === 'ark_images') return { ...form, model }
  const before = officialText(form.module, form.model)
  const after = officialText(form.module, model)
  const next = { ...form, model, imageCosts: model === form.model ? form.imageCosts : {} }
  for (const field of MODULE_PRICE_FIELDS[form.module]) {
    const value = form[field].trim()
    if (value === '' || value === before[field]) next[field] = after[field] ?? ''
  }
  return next
}

export type PriceOrigin =
  | { kind: 'official'; asOf: string }
  | { kind: 'edited'; asOf: string }
  | { kind: 'none' }
  | null

// What the price fields show against the table: the official price, an override of it, or a
// model the table does not know. null before a model is typed.
export function priceOrigin(form: ProviderForm): PriceOrigin {
  if (form.model.trim() === '') return null
  const entry = officialPrice(form.model)
  if (!entry) return { kind: 'none' }
  const official = officialText(form.module, form.model)
  const same = MODULE_PRICE_FIELDS[form.module].every((field) => {
    const typed = form[field].trim()
    return typed === '' || Number(typed) === Number(official[field])
  })
  return { kind: same ? 'official' : 'edited', asOf: entry.asOf }
}

// Blank or a non-negative decimal; anything else keeps Save disabled.
const PRICE_PATTERN = /^\s*(\d+(\.\d+)?)?\s*$/

function clearPrices(form: ProviderForm): ProviderForm {
  return { ...form, imageCosts: {}, priceInputTextPerM: '', priceInputImagePerM: '', priceOutputPerM: '' }
}

export function withBaseUrl(form: ProviderForm, baseUrl: string): ProviderForm {
  const clear = baseUrl.trim() !== form.baseUrl.trim() && form.adapter === 'openrouter_images'
  return { ...(clear ? clearPrices(form) : form), baseUrl }
}

// New rows offer the standard endpoint for the selected protocol. Stored rows cannot switch.
export function withAdapter(form: ProviderForm, adapter: ProviderAdapterId): ProviderForm {
  const baseUrl = adapter === 'openrouter_images' ? OPENROUTER_BASE_URL : adapter === 'ark_images' ? ARK_BASE_URL : DEFAULT_BASE_URL
  return { ...clearPrices(form), adapter, baseUrl, resolutions: [...tiersFor(adapter)] }
}

// Tiers fixed in code for adapters without a catalogue. OpenRouter's come from its catalogue.
export function tiersFor(adapter: ProviderAdapterId): readonly Resolution[] {
  return adapter === 'ark_images' ? ARK_RESOLUTIONS : RESOLUTIONS
}

// Ark bills per image in yuan from the code price table (ark-prices.ts); its token price fields are
// not used, and the floor needs a hand-entered per-image estimate for every tier until it has samples.
export const usesTokenPrices = (form: Pick<ProviderForm, 'adapter'>) => form.adapter !== 'ark_images'

export function toSaveInput(form: ProviderForm, provider: AdminProvider | null): SaveProviderInput {
  return {
    ...(provider ? { id: provider.id } : {}),
    module: form.module,
    adapter: form.adapter,
    resolutions: form.resolutions,
    estimatedImageCosts: Object.fromEntries(form.resolutions.filter((tier) => form.imageCosts[tier]?.trim()).map((tier) => [tier, Number(form.imageCosts[tier])])),
    label: form.label,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey,
    notes: form.notes,
    // Ark rows keep no token prices (fields hidden); blank is stored as null.
    priceInputTextPerM: usesTokenPrices(form) ? form.priceInputTextPerM : '',
    priceInputImagePerM: usesTokenPrices(form) ? form.priceInputImagePerM : '',
    priceOutputPerM: usesTokenPrices(form) ? form.priceOutputPerM : '',
  }
}

// Save stays disabled until the required fields are filled; the server validates again. A key
// is required for a new row and for a row that has none.
export function canSave(form: ProviderForm, needsKey: boolean): boolean {
  const filled = [form.label, form.baseUrl, form.model].every((value) => value.trim() !== '')
  const pricesOk = PRICE_FIELDS.every((field) => PRICE_PATTERN.test(form[field]))
  const estimatesOk = form.resolutions.every((tier) => {
    const cost = form.imageCosts[tier]?.trim()
    if (!cost && form.adapter === 'ark_images') return false
    return !cost || (PRICE_PATTERN.test(cost) && Number(cost) > 0 && Number.isFinite(Number(cost)))
  })
  return filled && estimatesOk && form.resolutions.length > 0 && pricesOk && (!needsKey || form.apiKey.trim() !== '')
}

// The tier checkboxes (PR-1b). `catalog`: OpenRouter's detected tiers (null while its lookup is
// pending). `saved`: the stored row, whose choice is kept while the model is the same.
export type TierOptions = { detected: readonly Resolution[]; allowed: readonly Resolution[]; selected: Resolution[]; declared: Resolution[]; unknownModel: boolean }

type Saved = Pick<AdminProvider, 'model' | 'resolutions'> | null | undefined

function detectedTiers(form: ProviderForm, catalog: readonly Resolution[] | null, saved: Saved) {
  const model = form.model.trim()
  if (form.adapter === 'openai_images') return openAIImageTiers(model)
  if (form.adapter === 'ark_images') return { tiers: ARK_RESOLUTIONS, known: true }
  return { tiers: catalog ?? (saved?.model === model ? saved.resolutions : []), known: true }
}

// The admin's own ticks for this model, else the saved row's choice for the same model, else the
// default: everything detected, or 1K for an unknown model.
function startingChoice(form: ProviderForm, saved: Saved, fallback: readonly Resolution[]) {
  const model = form.model.trim()
  if (form.tiersTouchedFor === model) return form.resolutions
  return saved && saved.model === model ? saved.resolutions : fallback
}

export function tierOptions(form: ProviderForm, catalog: readonly Resolution[] | null, saved?: Saved): TierOptions {
  const { tiers: detected, known } = detectedTiers(form, catalog, saved)
  const unknownModel = !known
  const fallback = unknownModel ? UNKNOWN_MODEL_TIERS : detected
  const allowed = unknownModel ? RESOLUTIONS : detected
  const picked = allowed.filter((tier) => startingChoice(form, saved, fallback).includes(tier))
  const selected = picked.length ? picked : [...fallback]
  return { detected, allowed, selected, declared: unknownModel ? selected.filter((tier) => !UNKNOWN_MODEL_TIERS.includes(tier)) : [], unknownModel }
}

export function withTier(form: ProviderForm, current: readonly Resolution[], tier: Resolution, on: boolean): ProviderForm {
  const next = on ? [...current, tier] : current.filter((value) => value !== tier)
  return { ...form, resolutions: RESOLUTIONS.filter((value) => next.includes(value)), tiersTouchedFor: form.model.trim() }
}
