import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { lookupProviderPrice, saveProvider } from './commands'
import { refreshCatalogPrice } from './refresh-capabilities'
import { runProviderAction } from './run'

// Live prices (ARCHITECTURE §10.0): a text line's price is read from OpenRouter's public catalogue
// on save and daily, an Ark line's is typed in. Catalogue responses are mocked; prices are fixtures.
const id = '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e'
const actor = '00000000-0000-4000-8000-0000000000aa'
const resolveHost = async () => ['1.1.1.1']
const text = {
  module: 'decision', adapter: 'openai_responses', label: 'Judge', baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/gpt-6.1-sol', apiKey: 'sk-or-fixture-key-1234',
}
const models = { data: [{ id: 'openai/gpt-6.1-sol', pricing: { prompt: '0.000002', completion: '0.00001' } }] }

function fakeDb(updated = true) {
  const writes: { values: unknown; filters: [string, unknown][] }[] = []
  const update = vi.fn((values: unknown) => {
    const write = { values, filters: [] as [string, unknown][] }
    writes.push(write)
    const chain = {
      eq: (column: string, value: unknown) => (write.filters.push([column, value]), chain),
      select: async () => ({ data: updated ? [{ id }] : [], error: null }),
    }
    return chain
  })
  const from = vi.fn(() => ({ update }))
  const rpc = vi.fn(async (fn: string) => ({ data: fn === 'admin_save_provider' ? id : null, error: null }))
  return { db: { from, rpc } as unknown as SupabaseClient, rpc, writes }
}

describe('catalogue price on save', () => {
  it("stores the catalogue price with fetchedAt for the saved model, and none of the form's copy", async () => {
    const { db, rpc, writes } = fakeDb()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(models))
    await saveProvider({ db, fetch, resolveHost }, actor, { ...text, priceInputTextPerM: '', priceOutputPerM: '' })
    expect(rpc).toHaveBeenCalledWith('admin_save_provider', expect.objectContaining({
      p_settings: expect.objectContaining({ price_input_text_per_m: null, price_output_per_m: null }),
    }))
    expect(writes).toHaveLength(1)
    expect(writes[0]!.values).toEqual({ catalog_price: expect.objectContaining({
      status: 'quoted', catalogModel: 'openai/gpt-6.1-sol', fetchedAt: expect.any(String), prices: { inputTextPerM: 2, inputImagePerM: null, outputPerM: 10 },
    }) })
    // Only while the row still runs that model on that endpoint.
    expect(writes[0]!.filters).toEqual([['id', id], ['model', 'openai/gpt-6.1-sol'], ['base_url', 'https://openrouter.ai/api/v1']])
  })

  it('still saves when the catalogue is down, keeping the last snapshot', async () => {
    const { db, writes } = fakeDb()
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 503 }))
    expect(await runProviderAction(() => saveProvider({ db, fetch, resolveHost }, actor, text))).toEqual({ ok: true, value: id })
    expect(writes).toHaveLength(0)
  })

  it('never reads a catalogue for a line that has none', async () => {
    const { db, writes } = fakeDb()
    const fetch = vi.fn<typeof globalThis.fetch>()
    expect(await refreshCatalogPrice({ db, fetch }, { id, adapter: 'openai_responses', baseUrl: 'https://relay.example.com/v1', model: 'x' })).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
  })

  it('previews the price for the editor, and says when the catalogue cannot be read', async () => {
    const ok = vi.fn<typeof globalThis.fetch>(async () => Response.json(models))
    vi.stubGlobal('fetch', ok)
    try {
      expect(await lookupProviderPrice({ adapter: 'openai_responses', baseUrl: text.baseUrl, model: text.model, retry: true }))
        .toMatchObject({ status: 'quoted', prices: { inputTextPerM: 2, outputPerM: 10 } })
      expect(await lookupProviderPrice({ adapter: 'ark_images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-x' })).toBeNull()
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })))
      expect(await runProviderAction(() => lookupProviderPrice({ adapter: 'openai_responses', baseUrl: text.baseUrl, model: text.model, retry: true })))
        .toEqual({ ok: false, reason: 'openrouter_catalog_unavailable' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Ark list price on save', () => {
  const listPrice = { model: 'doubao-x', outputBands: [{ maxPixels: null, cny: 0.12 }], inputImageCny: 0, source: 'https://example.com/price', asOf: '2026-11-15' }
  const ark = {
    module: 'image', adapter: 'ark_images', label: 'Seedream', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-x',
    apiKey: 'ark-fixture-key-1234', resolutions: ['1k', '2k'], estimatedImageCosts: { '1k': 0.03, '2k': 0.05 },
  }

  it('stores the typed price, with its source and date, through the admin-checked function', async () => {
    const { db, rpc } = fakeDb()
    await saveProvider({ db, fetch: vi.fn<typeof globalThis.fetch>(), resolveHost }, actor, { ...ark, listPrice })
    expect(rpc).toHaveBeenCalledWith('admin_set_provider_list_price', { p_actor: actor, p_id: id, p_price: listPrice })
  })

  it('keeps the stored price when an older editor sends none, and refuses one without a source', async () => {
    const { db, rpc } = fakeDb()
    await saveProvider({ db, fetch: vi.fn<typeof globalThis.fetch>(), resolveHost }, actor, ark)
    expect(rpc).not.toHaveBeenCalledWith('admin_set_provider_list_price', expect.anything())
    expect(await runProviderAction(() => saveProvider({ db, resolveHost }, actor, { ...ark, listPrice: { ...listPrice, source: 'not a url' } })))
      .toEqual({ ok: false, reason: 'invalid_input' })
  })
})

describe('Ark list price belongs to its model', () => {
  it('refuses a price typed for another model than the one saved', async () => {
    const { db } = fakeDb()
    const ark = {
      module: 'image', adapter: 'ark_images', label: 'Seedream', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-y',
      apiKey: 'ark-fixture-key-1234', resolutions: ['1k', '2k'], estimatedImageCosts: { '1k': 0.03, '2k': 0.05 },
    }
    const listPrice = { model: 'doubao-x', outputBands: [{ maxPixels: null, cny: 0.12 }], inputImageCny: 0, source: 'https://example.com/price', asOf: '2026-11-15' }
    expect(await runProviderAction(() => saveProvider({ db, resolveHost }, actor, { ...ark, listPrice }))).toEqual({ ok: false, reason: 'invalid_input' })
  })
})
