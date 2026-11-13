import { describe, expect, it } from 'vitest'

import { saveProviderSchema } from '../providers/schema'
import type { AdminProvider } from '../providers/types'

import { canSave, DEFAULT_FORM, formFor, missingPrices, priceOrigin, pricesFromTable, toSaveInput, withAdapter, withModel, tierOptions, withTier, type ProviderForm } from './form-state'
import type { Resolution } from '@/core/templates/output-options'

const provider: AdminProvider = {
  id: '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e',
  module: 'image',
  adapter: 'openai_images',
  resolutions: ['1k', '2k', '4k'],
  label: 'OpenAI 官方',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-image-2.6',
  apiKeyLast4: 'abcd',
  isActive: true,
  notes: null,
  prices: { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 },
  updatedAt: '2026-11-06T00:00:00Z',
}

describe('provider form state', () => {
  it('starts an edit with a blank key, so saving keeps the stored one', () => {
    const form = formFor(provider)
    expect(form.apiKey).toBe('')
    expect(toSaveInput(form, provider)).toMatchObject({ id: provider.id, apiKey: '', model: 'gpt-image-2.6' })
    expect(canSave(form, false)).toBe(true)
  })

  it('uses the selected adapter endpoint and saves the model’s supported tiers', () => {
    const router = withAdapter(formFor(null), 'openrouter_images')
    expect(router.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(toSaveInput({ ...router, resolutions: ['1k'] }, provider)).toMatchObject({ adapter: 'openrouter_images', resolutions: ['1k'] })
    expect(canSave({ ...router, resolutions: [] }, false)).toBe(false)
    expect(withAdapter(router, 'openai_images').baseUrl).toBe('https://api.openai.com/v1')
  })

  it('keeps a legacy submission without tiers distinct from an explicit change', () => {
    const input = toSaveInput(formFor(provider), provider)
    const legacy = { ...input, resolutions: undefined }
    expect(saveProviderSchema.parse(legacy).resolutions).toBeUndefined()
    expect(saveProviderSchema.safeParse({ ...input, resolutions: [] }).success).toBe(false)
  })

  it('requires a key for a new provider', () => {
    const form = { ...DEFAULT_FORM, label: 'Relay', model: 'gpt-image-2.6' }
    expect(canSave(form, true)).toBe(false)
    expect(canSave({ ...form, apiKey: 'sk-new-key-1234' }, true)).toBe(true)
    expect(toSaveInput(form, null)).not.toHaveProperty('id')
  })

  it('adds a new row to the section it was opened from, with that module adapter (T30)', () => {
    const form = { ...formFor(null, 'decision'), label: 'OpenAI', model: 'gpt-6-luna', apiKey: 'sk-new-key-1234' }
    expect(toSaveInput(form, null)).toMatchObject({ module: 'decision', adapter: 'openai_responses' })
    expect(toSaveInput(formFor(provider), provider)).toMatchObject({ module: 'image', adapter: 'openai_images' })
  })

  it('round-trips the three prices and flags a provider with one missing (T33)', () => {
    const form = formFor(provider)
    expect(form).toMatchObject({ priceInputTextPerM: '5', priceInputImagePerM: '8', priceOutputPerM: '30' })
    expect(toSaveInput(form, provider)).toMatchObject({ priceInputTextPerM: '5', priceOutputPerM: '30' })
    expect(missingPrices(provider.prices)).toBe(false)
    expect(missingPrices({ ...provider.prices, outputPerM: null })).toBe(true)
    // A decision row (T30) needs no image price.
    expect(missingPrices({ ...provider.prices, inputImagePerM: null }, 'decision')).toBe(false)
    expect(missingPrices({ ...provider.prices, outputPerM: null }, 'decision')).toBe(true)
  })

  it('keeps Save disabled while a price is not a non-negative number; blank is allowed', () => {
    const form = formFor(provider)
    expect(canSave({ ...form, priceOutputPerM: '' }, false)).toBe(true)
    expect(canSave({ ...form, priceOutputPerM: '0.25' }, false)).toBe(true)
    expect(canSave({ ...form, priceOutputPerM: '-1' }, false)).toBe(false)
    expect(canSave({ ...form, priceOutputPerM: '3o' }, false)).toBe(false)
  })
})

it('keeps per-image USD estimates on edit and clears them when switching models', () => {
  const form = formFor({ ...provider, estimatedImageCosts: { '1k': 0.009 } })
  expect(toSaveInput(form, provider).estimatedImageCosts).toEqual({ '1k': 0.009 })
  expect(toSaveInput(withModel(form, 'another'), provider).estimatedImageCosts).toEqual({})
  expect(canSave({ ...form, imageCosts: { '1k': '-1' } }, false)).toBe(false)
})

describe('official price pre-fill (§10.0)', () => {
  it('pre-fills the official price when a typed model is in the price table (§10.0)', () => {
    const form = withModel({ ...DEFAULT_FORM, label: 'OpenAI' }, 'gpt-image-2.6-sunburst')
    expect(form).toMatchObject({ model: 'gpt-image-2.6-sunburst', priceInputTextPerM: '5', priceInputImagePerM: '8', priceOutputPerM: '30' })
    expect(priceOrigin(form)).toEqual({ kind: 'official', asOf: '2026-11-06' })
    // A decision row gets input / output only.
    const decision = withModel({ ...DEFAULT_FORM, module: 'decision' }, 'gpt-6-luna')
    expect(decision).toMatchObject({ priceInputTextPerM: '0.1', priceInputImagePerM: '', priceOutputPerM: '0.5' })
  })

  it("lets the Owner override, keeps a typed price when the model changes, and clears an untouched pre-fill", () => {
    const prefilled = withModel(DEFAULT_FORM, 'gpt-image-2.6-sunburst')
    const edited = { ...prefilled, priceOutputPerM: '32' }
    expect(priceOrigin(edited)).toEqual({ kind: 'edited', asOf: '2026-11-06' })
    const other = withModel(edited, 'gpt-image-2.6')
    expect(other).toMatchObject({ priceInputTextPerM: '', priceInputImagePerM: '', priceOutputPerM: '32' })
    expect(priceOrigin(other)).toEqual({ kind: 'none' })
    expect(priceOrigin(DEFAULT_FORM)).toBeNull()
  })

  it('fills blank prices when opening a row on a table model, never ones it has', () => {
    const empty = { inputTextPerM: null, inputImagePerM: null, outputPerM: 31 }
    const form = formFor({ ...provider, model: 'gpt-image-2.6-sunburst', prices: empty })
    expect(form).toMatchObject({ priceInputTextPerM: '5', priceInputImagePerM: '8', priceOutputPerM: '31' })
    expect(formFor({ ...provider, prices: empty }).priceInputTextPerM).toBe('')
  })

  it('flags missing prices only when neither the row nor the table has them, and says what the table fills', () => {
    const empty = { inputTextPerM: null, inputImagePerM: null, outputPerM: null }
    expect(missingPrices(empty, 'image', 'gpt-image-2.6-sunburst')).toBe(false)
    expect(missingPrices(empty, 'decision', 'gpt-6-luna')).toBe(false)
    expect(missingPrices(empty, 'image', 'gpt-6-luna')).toBe(true)
    expect(missingPrices(empty, 'image', 'gpt-image-2.6')).toBe(true)
    expect(pricesFromTable(empty, 'image', 'gpt-image-2.6-sunburst')).toBe('2026-11-06')
    expect(pricesFromTable(provider.prices, 'image', 'gpt-image-2.6-sunburst')).toBeNull()
    expect(pricesFromTable(empty, 'image', 'gpt-image-2.6')).toBeNull()
  })
})

describe('tier checkboxes (PR-1b)', () => {
  const openAI = (model: string): ProviderForm => ({ ...DEFAULT_FORM, adapter: 'openai_images', model })

  it('offers a known OpenAI model all three and lets the admin narrow them', () => {
    const form = openAI('gpt-image-2.6')
    expect(tierOptions(form, null)).toMatchObject({ allowed: ['1k', '2k', '4k'], selected: ['1k', '2k', '4k'], declared: [], unknownModel: false })
    const narrowed = withTier(form, ['1k', '2k', '4k'], '4k', false)
    expect(tierOptions(narrowed, null)).toMatchObject({ selected: ['1k', '2k'], declared: [] })
  })

  it('starts an unknown model at 1K and counts ticked tiers as declared', () => {
    const form = openAI('gpt-image-3')
    expect(tierOptions(form, null)).toMatchObject({ allowed: ['1k', '2k', '4k'], selected: ['1k'], declared: [], unknownModel: true })
    const ticked = withTier(form, ['1k'], '4k', true)
    expect(tierOptions(ticked, null)).toMatchObject({ selected: ['1k', '4k'], declared: ['4k'] })
  })

  it('never carries ticks over to another model', () => {
    const ticked = withTier(openAI('gpt-image-3'), ['1k'], '2k', true)
    expect(tierOptions({ ...ticked, model: 'gpt-image-4' }, null)).toMatchObject({ selected: ['1k'], declared: [] })
    // A known model's full default does not become a declaration on an unknown one either.
    expect(tierOptions({ ...openAI('gpt-image-2.6'), model: 'gpt-image-3' }, null)).toMatchObject({ selected: ['1k'], declared: [] })
  })

  it('keeps the saved choice while the model is the same', () => {
    const saved = { model: 'gpt-image-2.6', resolutions: ['1k', '2k'] as Resolution[] }
    expect(tierOptions(openAI('gpt-image-2.6'), null, saved)).toMatchObject({ selected: ['1k', '2k'] })
    expect(tierOptions(openAI('gpt-image-2.5'), null, saved)).toMatchObject({ selected: ['1k', '2k', '4k'] })
  })

  it('takes OpenRouter tiers from the catalogue and Ark from code', () => {
    expect(tierOptions({ ...DEFAULT_FORM, adapter: 'openrouter_images', model: 'x/y' }, ['1k', '2k'])).toMatchObject({ allowed: ['1k', '2k'], selected: ['1k', '2k'] })
    expect(tierOptions({ ...DEFAULT_FORM, adapter: 'ark_images', model: 'doubao' }, null)).toMatchObject({ allowed: ['1k', '2k'] })
  })
})
