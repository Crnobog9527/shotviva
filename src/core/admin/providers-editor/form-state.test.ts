import { describe, expect, it } from 'vitest'

import { saveProviderSchema } from '../providers/schema'
import type { AdminProvider } from '../providers/types'

import type { CatalogPrice } from '@/core/jobs/catalog-price'

import { arkPriceFromForm, canSave, catalogFields, DEFAULT_FORM, formFor, missingPrices, priceOrigin, pricedFromCatalog, toSaveInput, withAdapter, withModel, tierOptions, withTier, type ProviderForm } from './form-state'
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
    const priced = (prices: AdminProvider['prices']) => ({ ...provider, prices })
    expect(missingPrices(provider)).toBe(false)
    expect(missingPrices(priced({ ...provider.prices, outputPerM: null }))).toBe(true)
    // A decision row (T30) needs no image price.
    expect(missingPrices(priced({ ...provider.prices, inputImagePerM: null }), 'decision')).toBe(false)
    expect(missingPrices(priced({ ...provider.prices, outputPerM: null }), 'decision')).toBe(true)
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

// Fixture prices only: real ones come from the OpenRouter catalogue or the admin.
const SOL: CatalogPrice = {
  status: 'quoted', catalogModel: 'openai/gpt-6.1-sol', source: 'https://openrouter.ai/openai/gpt-6.1-sol',
  fetchedAt: '2026-11-15T03:00:00.000Z', prices: { inputTextPerM: 2, inputImagePerM: null, outputPerM: 10 },
}
const textRow: AdminProvider = {
  ...provider, module: 'decision', adapter: 'openai_responses', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-6.1-sol',
  prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null }, catalogPrice: SOL,
}

describe('catalogue prices (§10.0, no price table in code)', () => {
  it('shows the catalogue price with its source and date and does not store a copy of it', () => {
    const form = formFor(textRow)
    expect(priceOrigin(form, SOL, true)).toEqual({ kind: 'catalog', price: SOL })
    expect(catalogFields(form, SOL)).toEqual(['priceInputTextPerM', 'priceOutputPerM'])
    // Even a stale typed value is not saved while the catalogue prices that field.
    const typed = { ...form, priceInputTextPerM: '0.1', priceOutputPerM: '0.5' }
    expect(toSaveInput(typed, textRow, SOL)).toMatchObject({ priceInputTextPerM: '', priceOutputPerM: '' })
  })

  it('asks for a hand-entered price when the catalogue has none, and keeps what is typed', () => {
    const missing: CatalogPrice = { ...SOL, status: 'missing', prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null } }
    const form = { ...formFor(textRow), priceInputTextPerM: '3', priceOutputPerM: '12' }
    expect(priceOrigin(form, missing, true)).toEqual({ kind: 'manual', reason: 'missing' })
    expect(priceOrigin(form, null, true)).toEqual({ kind: 'manual', reason: 'no_catalog' })
    expect(priceOrigin(form, null, false)).toBeNull()
    expect(toSaveInput(form, textRow, missing)).toMatchObject({ priceInputTextPerM: '3', priceOutputPerM: '12' })
  })

  it("clears the previous model's own prices when the model changes", () => {
    const form = { ...formFor(textRow), priceInputTextPerM: '3', priceOutputPerM: '12' }
    expect(withModel(form, 'openai/gpt-6-luna')).toMatchObject({ model: 'openai/gpt-6-luna', priceInputTextPerM: '', priceOutputPerM: '' })
    expect(withModel(form, form.model)).toBe(form)
  })

  it('prices a row from its catalogue snapshot only while the snapshot is for its model', () => {
    expect(missingPrices(textRow, 'decision')).toBe(false)
    expect(pricedFromCatalog(textRow, 'decision')).toBe(SOL)
    const renamed = { ...textRow, model: 'openai/gpt-6-luna' }
    expect(missingPrices(renamed, 'decision')).toBe(true)
    expect(pricedFromCatalog(renamed, 'decision')).toBeNull()
    // The admin's own entry still prices a row the catalogue does not.
    expect(missingPrices({ ...renamed, prices: { inputTextPerM: 1, inputImagePerM: null, outputPerM: 4 } }, 'decision')).toBe(false)
  })
})

describe('Ark list price (typed in, 1566)', () => {
  const ark: ProviderForm = {
    ...withAdapter(formFor(null), 'ark_images'), label: 'Seedream', model: 'doubao-seedream-x', apiKey: 'ark-fixture-key-1234',
    resolutions: ['1k', '2k'], imageCosts: { '1k': '0.03', '2k': '0.05' },
  }
  const priced = { ...ark, arkOutputCny: '0.13', arkSplitMp: '2.61', arkOutputCnyAbove: '0.23', arkInputCny: '0.05', arkSource: 'https://www.volcengine.com/docs/82379/1544106', arkAsOf: '2026-11-15' }

  it('needs every price, the source page and the date before a save', () => {
    expect(canSave(ark, true)).toBe(false)
    expect(canSave(priced, true)).toBe(true)
    expect(canSave({ ...priced, arkSource: 'volcengine.com' }, true)).toBe(false)
    expect(canSave({ ...priced, arkAsOf: '' }, true)).toBe(false)
    expect(canSave({ ...priced, arkOutputCnyAbove: '' }, true)).toBe(false)
  })

  it('saves one band or two, and reads them back', () => {
    expect(arkPriceFromForm(priced)).toEqual({
      model: 'doubao-seedream-x',
      outputBands: [{ maxPixels: 2_610_000, cny: 0.13 }, { maxPixels: null, cny: 0.23 }], inputImageCny: 0.05,
      source: 'https://www.volcengine.com/docs/82379/1544106', asOf: '2026-11-15',
    })
    const flat = { ...priced, arkSplitMp: '', arkOutputCnyAbove: '' }
    expect(arkPriceFromForm(flat)).toMatchObject({ outputBands: [{ maxPixels: null, cny: 0.13 }] })
    const input = toSaveInput(priced, null)
    expect(saveProviderSchema.safeParse(input).success).toBe(true)
    const row: AdminProvider = { ...provider, adapter: 'ark_images', model: 'doubao-seedream-x', listPrice: input.listPrice ?? null }
    expect(formFor(row)).toMatchObject({ arkOutputCny: '0.13', arkSplitMp: '2.61', arkOutputCnyAbove: '0.23', arkInputCny: '0.05' })
    // A price stored for another model (a concurrent edit) is not shown or used.
    expect(formFor({ ...row, model: 'doubao-other' })).toMatchObject({ arkOutputCny: '', arkSource: '' })
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
