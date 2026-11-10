import { createClient } from '@supabase/supabase-js'
import { expect, it, vi } from 'vitest'

import { readPricingOptions, readTemplateQuote } from '.'

const approved = { edit: { quality: 'medium', costs: { '1k': 20, '2k': 37, '3k': 58 } } }
const t96 = [{ provider_id: null, label: 'env', model: 'test-image-model', adapter: 'openai_images',
  is_active: true, capabilities: {}, resolutions: ['1k', '2k', '3k'], estimated_image_costs: {}, p95: { '1k': 7 } }]
const v2 = { version: 'v2', unit_price: 0.011, providers: [{ ...t96[0], approved }] }
const receipt = { terms: 'terms-digest', active: 'env', routes: { env: 'provider-digest' } }

function pricingClient(answer: (endpoint: string) => Response) {
  const fetchQuote = vi.fn(async (url: RequestInfo | URL) => answer(new URL(url.toString()).pathname.split('/').pop()!))
  const db = createClient('https://pricing.example.test', 'fixture', {
    global: { fetch: fetchQuote }, auth: { persistSession: false, autoRefreshToken: false },
  })
  return { db, fetchQuote }
}

it.each([['T96', t96], ['v2', v2]] as const)('uses one %s input and returns its database-issued receipt', async (version, input) => {
  const { db, fetchQuote } = pricingClient(endpoint => {
    expect(endpoint).toBe('template_sync_pricing_input')
    return Response.json({ input, receipt })
  })
  const quote = await readTemplateQuote(db)
  expect(fetchQuote).toHaveBeenCalledTimes(1)
  expect(quote.receipt).toEqual(receipt)
  expect(quote.envModel).toEqual(expect.any(String))
  expect(quote.floors.models?.env).toBe(t96[0]!.model)
  expect(quote.floors.high['1k']).toBeGreaterThan(quote.floors.high['2k'])
  if (version === 'v2') {
    expect(quote.floors.approvals?.env).toEqual(approved)
    expect(quote.floors.version).toBe('v2')
  }
})

const missing = () => Response.json({ code: 'PGRST202', message: 'function missing' }, { status: 404 })
it('keeps the editor usable on older databases but requires the receipt for sync', async () => {
  const { db, fetchQuote } = pricingClient(endpoint => endpoint === 'admin_image_provider_pricing' ? Response.json(t96) : missing())
  await expect(readPricingOptions(db)).resolves.toMatchObject([{ model: t96[0]!.model }])
  fetchQuote.mockClear()
  await expect(readTemplateQuote(db)).rejects.toThrow()
  expect(fetchQuote).toHaveBeenCalledTimes(1)
})

it('offers only configured tiers confirmed by Router capabilities, including when a hidden tier has an estimate', async () => {
  const router = { ...v2.providers[0], adapter: 'openrouter_images', resolutions: ['1k', '2k', '3k'],
    capabilities: { resolutions: ['1k','2k'], aspectRatios: ['1:1'], originalRatio: false,
      minReferences: 0, maxReferences: 4, fetchedAt: '2026-11-01T00:00:00Z' }, estimated_image_costs: { '3k': 0.03 } }
  const { db } = pricingClient(() => Response.json({ input: { ...v2, providers: [router] }, receipt }))
  expect((await readTemplateQuote(db)).floors.resolutions).toEqual(['1k','2k'])
})
