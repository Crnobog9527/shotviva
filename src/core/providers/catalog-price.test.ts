import { describe, expect, it, vi } from 'vitest'

import { effectivePrices } from '../jobs/catalog-price'
import { catalogModelFor, currentCatalogPrice } from './catalog-model'
import { fetchCatalogPrice } from './catalog-price'

// Mocked catalogue responses, in OpenRouter's shapes (GET /models and /images/models/…/endpoints).
// The prices are fixtures, not data the app uses.
const models = {
  data: [
    { id: 'openai/gpt-6.1-sol', pricing: { prompt: '0.000002', completion: '0.00001', web_search: '0.01', overrides: [{ min_prompt_tokens: 272000, prompt: '0.000004' }] } },
    { id: 'openai/gpt-6-luna', pricing: { prompt: '0.0000001', completion: '0.0000005' } },
    { id: 'vendor/free-text', pricing: null },
  ],
}
const imageEndpoints = {
  id: 'openai/gpt-image-2.6-sunburst',
  endpoints: [{ provider_name: 'OpenAI', pricing: [
    { billable: 'input_image', unit: 'token', cost_usd: 0.000008 },
    { billable: 'input_text', unit: 'token', cost_usd: 0.000005 },
    { billable: 'output_image', unit: 'token', cost_usd: 0.00003 },
  ] }],
}
const NOW = new Date('2026-11-15T03:00:00Z')
const OPENROUTER = 'https://openrouter.ai/api/v1'

function catalogue(body: unknown = models) {
  return vi.fn<typeof fetch>(async (url) => String(url).endsWith('/endpoints') ? Response.json(imageEndpoints) : Response.json(body))
}

describe('catalogue model for a line', () => {
  it('uses the model id on OpenRouter and openai/<model> on OpenAI, nothing elsewhere', () => {
    expect(catalogModelFor('openai_responses', `${OPENROUTER}/`, 'openai/gpt-6.1-sol')).toBe('openai/gpt-6.1-sol')
    expect(catalogModelFor('openai_responses', 'https://api.openai.com/v1', 'gpt-6-luna')).toBe('openai/gpt-6-luna')
    expect(catalogModelFor('openai_images', 'https://api.openai.com/v1', 'gpt-image-2.6-sunburst')).toBe('openai/gpt-image-2.6-sunburst')
    expect(catalogModelFor('openai_responses', 'https://relay.example.com/v1', 'gpt-6-luna')).toBeNull()
    expect(catalogModelFor('ark_images', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-seedream-5-5-261028')).toBeNull()
    // OpenRouter image lines keep their quote in capabilities.catalogPricing.
    expect(catalogModelFor('openrouter_images', OPENROUTER, 'openai/gpt-image-2.6-sunburst')).toBeNull()
  })
})

describe('fetchCatalogPrice', () => {
  it("reads a text model's standard per-million price from GET /models, with its source and time", async () => {
    const fetch = catalogue()
    const price = await fetchCatalogPrice('openai_responses', OPENROUTER, 'openai/gpt-6.1-sol', fetch, NOW)
    expect(price).toEqual({
      status: 'quoted', catalogModel: 'openai/gpt-6.1-sol', source: 'https://openrouter.ai/openai/gpt-6.1-sol', fetchedAt: '2026-11-15T03:00:00.000Z',
      prices: { inputTextPerM: 2, inputImagePerM: null, outputPerM: 10 },
    })
    // Public metadata only: one GET, no key or other header.
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]![0]).toBe(`${OPENROUTER}/models`)
    expect(fetch.mock.calls[0]![1]).toMatchObject({ method: 'GET' })
    expect(fetch.mock.calls[0]![1]?.headers).toBeUndefined()
  })

  it('prices an official OpenAI line from the catalogue listing of the same model', async () => {
    const text = await fetchCatalogPrice('openai_responses', 'https://api.openai.com/v1', 'gpt-6-luna', catalogue(), NOW)
    expect(text?.prices).toEqual({ inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 })
    const image = await fetchCatalogPrice('openai_images', 'https://api.openai.com/v1', 'gpt-image-2.6-sunburst', catalogue(), NOW)
    expect(image).toMatchObject({ status: 'quoted', catalogModel: 'openai/gpt-image-2.6-sunburst', prices: { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 } })
  })

  it('says missing for a model the catalogue lists without a price or does not list', async () => {
    expect(await fetchCatalogPrice('openai_responses', OPENROUTER, 'vendor/free-text', catalogue(), NOW)).toMatchObject({ status: 'missing' })
    expect(await fetchCatalogPrice('openai_responses', OPENROUTER, 'vendor/unknown', catalogue(), NOW)).toMatchObject({
      status: 'missing', prices: { inputTextPerM: null, inputImagePerM: null, outputPerM: null },
    })
  })

  it('returns null (keep the last snapshot) when the catalogue cannot be read, and for a line without one', async () => {
    const down = vi.fn<typeof fetch>(async () => new Response('upstream detail', { status: 502 }))
    expect(await fetchCatalogPrice('openai_responses', OPENROUTER, 'openai/gpt-6.1-sol', down, NOW)).toBeNull()
    expect(await fetchCatalogPrice('openai_responses', OPENROUTER, 'openai/gpt-6.1-sol', catalogue({ nope: true }), NOW)).toBeNull()
    const never = vi.fn<typeof fetch>()
    expect(await fetchCatalogPrice('ark_images', 'https://ark.cn-beijing.volces.com/api/v3', 'doubao-x', never, NOW)).toBeNull()
    expect(never).not.toHaveBeenCalled()
  })

  it('costs a job with the catalogue price first and only for the model it was read for', async () => {
    const price = await fetchCatalogPrice('openai_responses', OPENROUTER, 'openai/gpt-6.1-sol', catalogue(), NOW)
    const row = { adapter: 'openai_responses' as const, baseUrl: OPENROUTER, model: 'openai/gpt-6.1-sol', catalogPrice: price }
    // A stale hand-entered copy on the row loses to the live price.
    expect(effectivePrices(currentCatalogPrice(row), { inputTextPerM: 0.1, inputImagePerM: null, outputPerM: 0.5 }))
      .toEqual({ inputTextPerM: 2, inputImagePerM: null, outputPerM: 10 })
    expect(currentCatalogPrice({ ...row, model: 'openai/gpt-6-luna' })).toBeNull()
    expect(currentCatalogPrice({ ...row, baseUrl: 'https://relay.example.com/v1' })).toBeNull()
  })
})
