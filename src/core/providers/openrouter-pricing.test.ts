import { describe, expect, it, vi } from 'vitest'

import { catalogTokenPrices } from '../templates/catalog-pricing'
import { fetchImageCapabilities } from './image-capabilities'
import { openRouterCatalogPricing } from './openrouter-catalog'
import { catalogImageEstimates, parseEndpointPrices } from './openrouter-pricing'
import samples from './image-catalog-sample.test.json'

const model = 'bytedance-seed/seedream-5-0-flash'
const base = 'https://openrouter.ai/api/v1'
const freeInput = { billable: 'input_image', unit: 'image', cost_usd: 0 }
const output = { billable: 'output_image', unit: 'image', cost_usd: 0.018 }
const endpoint = (pricing: unknown[]) => ({ provider_name: 'Seed', pricing })
const response = (endpoints: unknown[]) => ({ id: model, endpoints })
const quote = (...rates: unknown[]) => parseEndpointPrices(model, response([endpoint(rates)]))
const caps = { resolutions: ['1k', '2k'] as ('1k' | '2k')[], maxReferences: 14 }

describe('public OpenRouter endpoint quotes', () => {
  it('retains Seedream input and output units and estimates only its supported tiers with the accounting fee', () => {
    const pricing = quote(output, freeInput)
    expect(pricing.endpoints[0].rates).toEqual([output, freeInput])
    const estimates = catalogImageEstimates(pricing, caps)
    expect(estimates['1k']).toBeCloseTo(0.01899, 8)
    expect(estimates['2k']).toBe(estimates['1k'])
    expect(estimates['4k']).toBeUndefined()
  })

  it('keeps token, paid or unquoted reference input from becoming a flat per-image total', () => {
    for (const pricing of [quote({ ...output, unit: 'token' }, freeInput), quote(output), quote(output, { ...freeInput, cost_usd: 0.01 })]) {
      expect(pricing.status).toBe('quoted')
      expect(catalogImageEstimates(pricing, caps)).toEqual({})
    }
  })

  it('requires usable pricing across routable providers and uses the most expensive declared variant', () => {
    const other = endpoint([freeInput, { ...output, variant: '1k', cost_usd: 0.03 }])
    const pricing = parseEndpointPrices(model, response([endpoint([output, freeInput]), other]))
    expect(catalogImageEstimates(pricing, caps)['1k']).toBeCloseTo(0.03165)
    expect(catalogImageEstimates(pricing, caps)['2k']).toBeUndefined()
    expect(catalogImageEstimates(quote(output, { ...output, variant: 'high' }, freeInput), caps)).toEqual({})
    expect(parseEndpointPrices(model, { id: 'other', endpoints: [other] }).status).toBe('unavailable')
  })

  it('deduplicates concurrent public GETs and retries a temporary price failure without losing capabilities', async () => {
    let fail = true
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/endpoints')) {
        if (fail) return new Response(null, { status: 503 })
        return Response.json(response([endpoint([output, freeInput])]))
      }
      return Response.json({ data: [{ id: model, supported_parameters: samples[model] }] })
    })
    const sync = () => fetchImageCapabilities('openrouter_images', base, model, fetcher)
    const [first, second] = await Promise.all([sync(), sync()])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(first?.catalogPricing?.status).toBe('unavailable')
    expect(second?.resolutions).toEqual(['1k', '2k'])
    fail = false
    expect((await sync())?.catalogImageCosts?.['1k']).toBeCloseTo(0.01899, 8)
  })

  it('requires a reference range when the model explicitly advertises image input', async () => {
    const fetcher = async () => Response.json({ data: [{ id: model, architecture: { input_modalities: ['text', 'image'] },
      supported_parameters: { aspect_ratio: samples[model].aspect_ratio } }] })
    await expect(fetchImageCapabilities('openrouter_images', base, model, fetcher)).rejects.toMatchObject({ reason: 'openrouter_catalog_unavailable' })
  })

  it('never follows a supplied model path outside the configured catalogue', async () => {
    const fetcher = vi.fn()
    for (const id of ['../key', 'vendor/%2e%2e/key', '//private', 'https://other.example']) {
      expect((await openRouterCatalogPricing(base, id, fetcher)).status).toBe('unavailable')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([undefined, {}, { unrelated: 'value' }])('refuses to manufacture capabilities from an unrecognised block %j', async block => {
    const fetcher = async () => Response.json({ data: [{ id: model, supported_parameters: block }] })
    await expect(fetchImageCapabilities('openrouter_images', base, model, fetcher)).rejects.toMatchObject({ reason: 'openrouter_catalog_unavailable' })
  })
})

it('only quotes aggregate prompt tokens when every input modality and route agrees', () => {
  const text = { billable: 'input_text', unit: 'token', cost_usd: 0.000005 }
  const image = { ...text, billable: 'input_image' }
  const outputToken = { billable: 'output_image', unit: 'token', cost_usd: 0.00003 }
  expect(catalogTokenPrices(quote(text, image, outputToken))).toEqual({ inputTextPerM: 5, outputPerM: 30 })
  expect(catalogTokenPrices(quote(text, outputToken)).inputTextPerM).toBeNull()
  expect(catalogTokenPrices(quote(text, { ...image, cost_usd: 0.000008 }, outputToken)).inputTextPerM).toBeNull()
  expect(catalogTokenPrices(quote(output, freeInput))).toEqual({ inputTextPerM: null, outputPerM: null })
})
