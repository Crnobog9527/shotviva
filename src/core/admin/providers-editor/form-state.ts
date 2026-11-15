import { currentListPrice, type ArkPrice } from '@/core/jobs/ark-prices'
import { effectivePrices, livePrices, type CatalogPrice } from '@/core/jobs/catalog-price'
import { currentCatalogPrice } from '@/core/providers/catalog-model'
import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { ARK_RESOLUTIONS } from '@/core/providers/ark'
import { openAIImageTiers, UNKNOWN_MODEL_TIERS } from '@/core/providers/tier-support'
import { ARK_BASE_URL, DEFAULT_BASE_URL, isTextModule, MODULE_ADAPTER, OPENROUTER_BASE_URL, type ProviderAdapterId, type ProviderModule } from '@/core/providers/types'

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
  // USD per extra input image of a slot job (1442), as typed; blank means not set.
  extraInputCost: string
  // 「BYOK（按官方价）」 (1551): only shown, and only saved, for an OpenRouter openai/gpt-image-* line.
  byokListPrice: boolean
  label: string
  baseUrl: string
  model: string
  apiKey: string
  notes: string
  // US dollars per million tokens (T33), as typed; blank means not filled in.
  priceInputTextPerM: string
  priceInputImagePerM: string
  priceOutputPerM: string
  // An Ark line's list price in yuan (1566), as typed from Ark's price page: the output price per
  // image, optionally a second price above `arkSplitMp` million pixels; per input image; the page's
  // URL and the date it was read. All blank: no price (jobs then have no cost).
  arkOutputCny: string
  arkSplitMp: string
  arkOutputCnyAbove: string
  arkInputCny: string
  arkSource: string
  arkAsOf: string
}

type ArkFields = Pick<ProviderForm, 'arkOutputCny' | 'arkSplitMp' | 'arkOutputCnyAbove' | 'arkInputCny' | 'arkSource' | 'arkAsOf'>

const BLANK_ARK: ArkFields = { arkOutputCny: '', arkSplitMp: '', arkOutputCnyAbove: '', arkInputCny: '', arkSource: '', arkAsOf: '' }

export const PRICE_FIELDS = ['priceInputTextPerM', 'priceInputImagePerM', 'priceOutputPerM'] as const
export type PriceField = (typeof PRICE_FIELDS)[number]

export const DEFAULT_FORM: ProviderForm = {
  module: 'image',
  label: '',
  baseUrl: DEFAULT_BASE_URL,
  adapter: 'openai_images',
  resolutions: [...RESOLUTIONS],
  imageCosts: {},
  extraInputCost: '',
  byokListPrice: true,
  model: '',
  apiKey: '',
  notes: '',
  priceInputTextPerM: '',
  priceInputImagePerM: '',
  priceOutputPerM: '',
  ...arkFields(null),
}

const priceText = (value: number | null) => (value === null ? '' : String(value))


// The form's text for a stored price: one band, or a split at the first band's pixel limit.
function arkFields(price: ArkPrice | null | undefined): ArkFields {
  if (!price) return BLANK_ARK
  const [first, second] = price.outputBands
  const split = second && first.maxPixels ? { arkSplitMp: String(first.maxPixels / 1e6), arkOutputCnyAbove: String(second.cny) } : {}
  return { ...BLANK_ARK, ...split, arkOutputCny: String(first.cny), arkInputCny: String(price.inputImageCny), arkSource: price.source, arkAsOf: price.asOf }
}

export function formFor(provider: AdminProvider | null, module: ProviderModule = 'image'): ProviderForm {
  if (!provider) {
    const form = { ...DEFAULT_FORM, module, adapter: MODULE_ADAPTER[module] }
    // A new decision or dish-reading row starts on OpenRouter (decision-route.ts; Owner 2026-11-15).
    return isTextModule(module) ? { ...form, baseUrl: OPENROUTER_BASE_URL } : form
  }
  return {
    module: provider.module,
    adapter: provider.adapter,
    resolutions: provider.resolutions,
    imageCosts: Object.fromEntries(Object.entries(provider.estimatedImageCosts ?? {}).map(([tier, cost]) => [tier, String(cost)])),
    extraInputCost: provider.extraInputImageUsd == null ? '' : String(provider.extraInputImageUsd),
    byokListPrice: provider.byokListPrice ?? true,
    label: provider.label,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKey: '',
    notes: provider.notes ?? '',
    priceInputTextPerM: priceText(provider.prices.inputTextPerM),
    priceInputImagePerM: priceText(provider.prices.inputImagePerM),
    priceOutputPerM: priceText(provider.prices.outputPerM),
    ...arkFields(currentListPrice(provider)),
  }
}

// The prices each module's jobs are costed with. The decision step (T30) is billed as input and
// output tokens only: its preview image counts as input tokens, so it has no image price.
export const MODULE_PRICE_FIELDS: Record<ProviderModule, readonly PriceField[]> = {
  image: PRICE_FIELDS,
  decision: ['priceInputTextPerM', 'priceOutputPerM'],
  dish_read: ['priceInputTextPerM', 'priceOutputPerM'],
}

const PRICE_OF = { priceInputTextPerM: 'inputTextPerM', priceInputImagePerM: 'inputImagePerM', priceOutputPerM: 'outputPerM' } as const

type PricedProvider = Pick<AdminProvider, 'adapter' | 'baseUrl' | 'model' | 'prices' | 'catalogPrice'>

// A provider without the prices its module needs, from the catalogue or typed in by the admin,
// cannot cost its jobs; the list flags it (T33, §10.0).
export function missingPrices(provider: PricedProvider, module: ProviderModule = 'image'): boolean {
  const effective = effectivePrices(currentCatalogPrice(provider), provider.prices)
  return MODULE_PRICE_FIELDS[module].some((field) => (effective?.[PRICE_OF[field]] ?? null) === null)
}

// The catalogue snapshot that prices this row, when it quotes the module's fields; the list says so.
export function pricedFromCatalog(provider: PricedProvider, module: ProviderModule): CatalogPrice | null {
  const catalog = currentCatalogPrice(provider)
  const live = livePrices(catalog)
  return live && MODULE_PRICE_FIELDS[module].some((field) => live[PRICE_OF[field]] !== null) ? catalog : null
}

// Typing a model name: the admin's own prices were for the previous model, so they are cleared;
// the new model's catalogue price (if any) is looked up and shown instead (§10.0).
export function withModel(form: ProviderForm, model: string): ProviderForm {
  if (model === form.model) return form
  return { ...clearPrices(form), model, ...(form.adapter === 'ark_images' ? arkFields(null) : {}) }
}

// What the price fields show: the catalogue's price (read-only, with its source and date) or, when
// the catalogue has none for this model, the admin's own entry from the provider's price page.
// null before a model is typed or while the lookup runs.
export type PriceOrigin = { kind: 'catalog'; price: CatalogPrice } | { kind: 'manual'; reason: 'missing' | 'no_catalog' } | null

export function priceOrigin(form: ProviderForm, live: CatalogPrice | null | undefined, lookedUp: boolean): PriceOrigin {
  if (form.model.trim() === '' || !lookedUp) return null
  if (live?.status === 'quoted') return { kind: 'catalog', price: live }
  return { kind: 'manual', reason: live ? 'missing' : 'no_catalog' }
}

// The fields the catalogue fills (shown read-only and not stored on the row).
export function catalogFields(form: ProviderForm, live: CatalogPrice | null | undefined): PriceField[] {
  const prices = livePrices(live)
  return prices ? MODULE_PRICE_FIELDS[form.module].filter((field) => prices[PRICE_OF[field]] !== null) : []
}

export function catalogText(live: CatalogPrice | null | undefined, field: PriceField): string {
  return priceText(livePrices(live)?.[PRICE_OF[field]] ?? null)
}

// Blank or a non-negative decimal; anything else keeps Save disabled.
const PRICE_PATTERN = /^\s*(\d+(\.\d+)?)?\s*$/

function clearPrices(form: ProviderForm): ProviderForm {
  return { ...form, imageCosts: {}, priceInputTextPerM: '', priceInputImagePerM: '', priceOutputPerM: '' }
}

const ARK_FIELDS = ['arkOutputCny', 'arkSplitMp', 'arkOutputCnyAbove', 'arkInputCny', 'arkSource', 'arkAsOf'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// The Ark price as typed, or null when every field is blank; 'invalid' while incomplete.
const sourceOk = (source: string) => /^https:\/\/\S+$/.test(source) && source.length <= 500

function arkNumbersOk(form: ProviderForm): boolean {
  const split = form.arkSplitMp.trim() !== ''
  const numbers = [form.arkOutputCny, form.arkInputCny, ...(split ? [form.arkSplitMp, form.arkOutputCnyAbove] : [])]
  return numbers.every((value) => value.trim() !== '' && PRICE_PATTERN.test(value)) && (!split || Number(form.arkSplitMp) > 0)
}

function arkBands(form: ProviderForm): ArkPrice['outputBands'] {
  if (!form.arkSplitMp.trim()) return [{ maxPixels: null, cny: Number(form.arkOutputCny) }]
  return [{ maxPixels: Math.round(Number(form.arkSplitMp) * 1e6), cny: Number(form.arkOutputCny) }, { maxPixels: null, cny: Number(form.arkOutputCnyAbove) }]
}

export function arkPriceFromForm(form: ProviderForm): ArkPrice | null | 'invalid' {
  if (ARK_FIELDS.every((field) => form[field].trim() === '')) return null
  const source = form.arkSource.trim()
  const asOf = form.arkAsOf.trim()
  if (!arkNumbersOk(form) || !sourceOk(source) || !DATE_PATTERN.test(asOf)) return 'invalid'
  return { model: form.model.trim(), outputBands: arkBands(form), inputImageCny: Number(form.arkInputCny), source, asOf }
}

// Complete enough to save: Ark has no catalogue, so its list price is required.
export const arkPriceComplete = (form: ProviderForm) => {
  const price = arkPriceFromForm(form)
  return price !== null && price !== 'invalid'
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

// Ark bills per image in yuan from its admin-entered list price; its token price fields are not
// used, and the floor needs a hand-entered per-image estimate for every tier until it has samples.
export const usesTokenPrices = (form: Pick<ProviderForm, 'adapter'>) => form.adapter !== 'ark_images'

// The lines admin.provider_list_priced can price like the official OpenAI line (1551).
export const byokApplies = (form: Pick<ProviderForm, 'module' | 'adapter' | 'model'>) =>
  form.module === 'image' && form.adapter === 'openrouter_images' && form.model.trim().startsWith('openai/gpt-image-')

// `live`: the catalogue price shown in the form. Fields it fills are not stored on the row, so a
// price change upstream reaches the next job without anyone retyping it.
export function toSaveInput(form: ProviderForm, provider: AdminProvider | null, live?: CatalogPrice | null): SaveProviderInput {
  const fromCatalog = catalogFields(form, live)
  const manual = (field: PriceField) => (usesTokenPrices(form) && !fromCatalog.includes(field) ? form[field] : '')
  const listPrice = form.adapter === 'ark_images' ? arkPriceFromForm(form) : undefined
  return {
    ...(provider ? { id: provider.id } : {}),
    module: form.module,
    adapter: form.adapter,
    resolutions: form.resolutions,
    estimatedImageCosts: Object.fromEntries(form.resolutions.filter((tier) => form.imageCosts[tier]?.trim()).map((tier) => [tier, Number(form.imageCosts[tier])])),
    ...(form.module === 'image' ? { extraInputImageUsd: form.extraInputCost.trim() } : {}),
    ...(byokApplies(form) ? { byokListPrice: form.byokListPrice } : {}),
    label: form.label,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey,
    notes: form.notes,
    // Ark rows keep no token prices (fields hidden); blank is stored as null.
    priceInputTextPerM: manual('priceInputTextPerM'),
    priceInputImagePerM: manual('priceInputImagePerM'),
    priceOutputPerM: manual('priceOutputPerM'),
    ...(listPrice !== undefined && listPrice !== 'invalid' ? { listPrice } : {}),
  }
}

// Save stays disabled until the required fields are filled; the server validates again. A key
// is required for a new row and for a row that has none.
export function canSave(form: ProviderForm, needsKey: boolean): boolean {
  const filled = [form.label, form.baseUrl, form.model].every((value) => value.trim() !== '')
  const pricesOk = PRICE_FIELDS.every((field) => PRICE_PATTERN.test(form[field])) &&
    // Ark has no catalogue: its list price is typed in, with its source and date, before a save.
    (form.adapter !== 'ark_images' || arkPriceComplete(form))
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
  // A decision row has no image tiers and hides the control: keep the stored default, so renaming
  // its model (decision-route.ts) never empties them and blocks Save.
  if (isTextModule(form.module)) return { tiers: RESOLUTIONS, known: true }
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
