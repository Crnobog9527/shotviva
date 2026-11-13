import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { saveProvider, testProvider } from './commands'
import { runProviderAction } from './run'

const id = '6f1c2f9e-6a52-4c39-9a51-0a9f6b0c1d2e'
const baseUrl = 'https://relay.example.com/v1'
const model = 'vendor/new-image-model'
const input = { baseUrl, model, adapter: 'openrouter_images', label: 'Test relay', apiKey: 'test-key-for-unit-fixture' }
const resolveHost = async () => ['1.1.1.1']
const catalogue = { data: [{ id: model, supported_parameters: { resolution: { type: 'enum', values: ['768', '2K', '4K'] } } }] }

function fakeDb() {
  const row = {
    id, adapter: input.adapter, model, base_url: baseUrl, resolutions: ['2k', '4k'],
    price_input_text_per_m: null, price_input_image_per_m: null, price_output_per_m: null,
  }
  const select = () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) })
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn(async (fn: string) => ({ data: fn === 'admin_save_provider' ? id : input.apiKey, error: null }))
  return { db: { from, rpc } as unknown as SupabaseClient, from, rpc }
}

describe('OpenRouter provider administration', () => {
  it('refuses a model absent from the image catalogue before writing a row or key', async () => {
    const { db, from, rpc } = fakeDb()
    const fetch = vi.fn(async () => Response.json(catalogue))
    const result = await runProviderAction(() => saveProvider({ db, fetch, resolveHost }, id, { ...input, model: 'vendor/missing' }))
    expect(result).toEqual({ ok: false, reason: 'openrouter_model_missing' })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('saves verified capabilities and the write-only key in one call, narrowed to the ticked tiers the catalogue has', async () => {
    const { db, rpc } = fakeDb()
    await saveProvider({ db, fetch: async () => Response.json(catalogue), resolveHost }, id, { ...input, resolutions: ['1k', '2k'] })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_save_provider', expect.objectContaining({
      p_capabilities: expect.objectContaining({ resolutions: ['2k'], resolutionSource: 'catalog', resolutionLimit: ['2k'] }), p_key: input.apiKey,
    }))
  })


  it('saves real-unit public quotes on an existing model while reusing its Vault key and preserving overrides', async () => {
    const { db, rpc } = fakeDb()
    const rates = [{ billable: 'output_image', unit: 'image', cost_usd: 0.018 }, { billable: 'input_image', unit: 'image', cost_usd: 0 }]
    const fetch = vi.fn<typeof globalThis.fetch>(async url => String(url).endsWith('/endpoints')
      ? Response.json({ id: model, endpoints: [{ provider_name: 'Test', pricing: rates }] })
      : Response.json(catalogue))
    await saveProvider({ db, fetch, resolveHost }, id, { ...input, id, apiKey: '', estimatedImageCosts: { '2k': 0.1 } })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_save_provider', expect.objectContaining({
      p_key: null, p_settings: expect.objectContaining({ estimated_image_costs: { '2k': 0.1 } }),
      p_capabilities: expect.objectContaining({ catalogPricing: { status: 'quoted', endpoints: [{ name: 'Test', rates }] } }),
    }))
    expect(fetch.mock.calls.every(([, init]) => init?.method === 'GET' && !init.headers)).toBe(true)
  })

  it('assigns the standard tier if the catalogue declares no resolution parameter', async () => {
    const { db, rpc } = fakeDb()
    await saveProvider({ db, resolveHost, fetch: async () => Response.json({ data: [{ id: model, supported_parameters: { input_references: { type: 'range', min: 0, max: 3 } } }] }) }, id, input)
    expect(rpc).toHaveBeenCalledWith('admin_save_provider', expect.objectContaining({
      p_capabilities: expect.objectContaining({ resolutions: ['1k'] }),
    }))
  })

  it('distinguishes an unavailable catalogue from a missing model without leaking vendor text', async () => {
    const { db, from } = fakeDb()
    const fetch = async () => new Response('sensitive upstream detail', { status: 502 })
    expect(await runProviderAction(() => saveProvider({ db, fetch, resolveHost }, id, input)))
      .toEqual({ ok: false, reason: 'openrouter_catalog_unavailable' })
    expect(from).not.toHaveBeenCalled()
  })

  it('tests a stored row using only free GETs and sends the Vault key only to /key', async () => {
    const { db } = fakeDb()
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(catalogue))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
    expect(await testProvider({ db, resolveHost, fetch }, { id })).toMatchObject({ ok: false, failure: 'unauthorized', status: 401 })
    expect(fetch.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      [baseUrl + '/images/models', 'GET'], [baseUrl + '/key', 'GET'],
    ])
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
    expect(fetch.mock.calls[0][1]?.headers).toBeUndefined()
    expect(fetch.mock.calls[1][1]?.headers).toEqual({ Authorization: 'Bearer ' + input.apiKey })
  })
})

describe('OpenRouter tier choice (PR-1b)', () => {
  it('refuses ticked tiers the catalogue no longer has, instead of opening ones the admin left off', async () => {
    const { db, rpc } = fakeDb()
    await expect(saveProvider({ db, fetch: async () => Response.json(catalogue), resolveHost }, id, { ...input, resolutions: ['1k'] }))
      .rejects.toMatchObject({ reason: 'invalid_input' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
