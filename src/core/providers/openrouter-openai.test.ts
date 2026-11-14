import { describe, expect, it } from 'vitest'

import { PROVIDER_ASPECTS } from '../templates/image-options'
import { creditMinimum } from '../templates/pricing'
import { imageCostBudget, modelCreditFloor } from '../templates/provider-pricing'
import { fetchImageCapabilities } from './image-capabilities'
import { openRouterInputMismatch } from './openrouter-input'
import { catalogImageEstimates, parseEndpointPrices } from './openrouter-pricing'

// The public catalogue entries for OpenAI's GPT image models, captured 2026-11-15: no resolution
// enum, token pricing only.
const base = 'https://openrouter.ai/api/v1'
const enumOf = (...values: string[]) => ({ type: 'enum', values })
const parameters = {
  aspect_ratio: enumOf('1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', 'auto'),
  output_format: enumOf('png', 'jpeg', 'webp', 'gif'),
  quality: enumOf('auto', 'low', 'medium', 'high', 'xhigh', 'max'),
  input_references: { type: 'range', min: 0, max: 16 },
}
const tokenRates = [
  { billable: 'input_image', unit: 'token', cost_usd: 0.000008 },
  { billable: 'input_text', unit: 'token', cost_usd: 0.000005 },
  { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
]
const catalog = (rates: unknown[]) => async (url: RequestInfo | URL) => String(url).endsWith('/endpoints')
  ? Response.json({ id: decodeURIComponent(String(url).split('/images/models/')[1]!.replace('/endpoints', '')), endpoints: [{ provider_name: 'OpenAI', pricing: rates }] })
  : Response.json({ data: ['openai/gpt-image-2.6-sunburst', 'openai/gpt-image-2', 'openai/gpt-image-1'].map(id => ({
    id, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: parameters,
  })) })

describe('OpenAI GPT image models on OpenRouter', () => {
  it.each(['openai/gpt-image-2.6-sunburst', 'openai/gpt-image-2'])('%s gets the official tiers, every site ratio and 16 inputs', async (model) => {
    const caps = await fetchImageCapabilities('openrouter_images', base, model, catalog(tokenRates))
    expect(caps).toMatchObject({ resolutions: ['1k', '2k', '4k'], resolutionSource: 'catalog', originalRatio: true, maxReferences: 16 })
    expect(caps?.providerAspectRatios).toEqual(PROVIDER_ASPECTS)
    // The official line's medium estimate plus OpenRouter's top-up fee.
    expect(caps?.catalogImageCosts?.['1k']).toBeCloseTo(0.055 * 1.055, 8)
    expect(caps?.catalogImageCosts?.['2k']).toBeCloseTo(0.095 * 1.055, 8)
    expect(caps?.catalogImageCosts?.['4k']).toBeCloseTo(0.135 * 1.055, 8)
  })

  it('keeps gpt-image-1 at its one fixed tier', async () => {
    const caps = await fetchImageCapabilities('openrouter_images', base, 'openai/gpt-image-1', catalog(tokenRates))
    expect(caps?.resolutions).toEqual(['1k'])
  })

  it('narrows to the tiers an admin keeps', async () => {
    const caps = await fetchImageCapabilities('openrouter_images', base, 'openai/gpt-image-2.6-sunburst', catalog(tokenRates), ['1k', '2k'])
    expect(caps).toMatchObject({ resolutions: ['1k', '2k'], resolutionLimit: ['1k', '2k'] })
  })

  it('scales the estimate up when a route charges more than OpenAI list rates, never down', () => {
    const quote = (rates: unknown[]) => parseEndpointPrices('openai/gpt-image-2', { id: 'openai/gpt-image-2', endpoints: [{ provider_name: 'X', pricing: rates }] })
    const caps = { resolutions: ['1k'] as '1k'[], maxReferences: 16 }
    const dearer = tokenRates.map(r => r.billable === 'output_image' ? { ...r, cost_usd: 0.00006 } : r)
    expect(catalogImageEstimates(quote(dearer), caps, 'openai/gpt-image-2')['1k']).toBeCloseTo(0.055 * 2 * 1.055, 8)
    const cheaper = tokenRates.map(r => ({ ...r, cost_usd: r.cost_usd / 2 }))
    expect(catalogImageEstimates(quote(cheaper), caps, 'openai/gpt-image-2')['1k']).toBeCloseTo(0.055 * 1.055, 8)
    // A charge the estimate does not cover leaves the tier for an admin's estimate.
    expect(catalogImageEstimates(quote([...tokenRates, { billable: 'request', unit: 'request', cost_usd: 0.01 }]), caps, 'openai/gpt-image-2')).toEqual({})
  })

  it('accepts any site ratio as a pixel size, and still checks the tier and reference count', () => {
    const request = { resolution: '4k', aspectRatio: '4:5', referenceCount: 16 } as const
    expect(openRouterInputMismatch(request, parameters as never, 'openai/gpt-image-2.6-sunburst')).toBeNull()
    expect(openRouterInputMismatch({ ...request, referenceCount: 17 }, parameters as never, 'openai/gpt-image-2.6-sunburst'))
      .toMatchObject({ reason: 'reference_image_limit' })
    expect(openRouterInputMismatch({ ...request, resolution: '2k' }, parameters as never, 'openai/gpt-image-1'))
      .toMatchObject({ reason: 'unsupported_resolution' })
  })
})

describe('the sale floor on the OpenRouter GPT image route', () => {
  // Test site's lowest credit price, 2026-11-15; the official line's extra-input cost.
  const budget = imageCostBudget(0.00530357142857142857)
  const estimates = { '1k': 0.055 * 1.055, '2k': 0.095 * 1.055, '4k': 0.135 * 1.055 }
  const floor = (extraInputUsd: number | null) => modelCreditFloor({
    openAI: false, resolutions: ['1k', '2k', '4k'], estimates, p95: {}, slotCosts: { extraInputUsd, p95Full: {} },
  }, budget)

  it('keeps a four-slot medium prize poster under 79 / 99 / 149 once the extra-input cost is filled in', () => {
    const f = floor(0.0125 * 1.055)
    expect(creditMinimum(f, 'medium', '1k', 4)).toBeLessThan(79)
    expect(creditMinimum(f, 'medium', '2k', 4)).toBeLessThan(99)
    expect(creditMinimum(f, 'medium', '4k', 4)).toBeLessThan(149)
  })
})
