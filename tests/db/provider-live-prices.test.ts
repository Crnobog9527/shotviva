import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveProvider } from '@/core/admin'
import { refreshCatalogPrice } from '@/core/admin/providers/refresh-capabilities'
import { findProvider } from '@/core/providers'

import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'

// 1566: a line's price is read from OpenRouter's public catalogue (catalog_price, with fetchedAt)
// or typed in by the admin (Ark's list_price); there is no price table in code (ARCHITECTURE §10.0).
// No row here is activated, so this file does not race ai-providers.test.ts for the active row.
// Catalogue responses are mocked and the prices are fixtures.

const PREFIX = 'T1566 live price'
const KEY = 'sk-t1566-live-price-0123456789'
const models = { data: [{ id: 'openai/gpt-6.1-sol', pricing: { prompt: '0.000002', completion: '0.00001' } }] }
const LIST_PRICE = { outputBands: [{ maxPixels: 2_610_000, cny: 0.13 }, { maxPixels: null, cny: 0.23 }], inputImageCny: 0.05, source: 'https://example.com/price', asOf: '2026-11-15' }

let pg: Client
let adminId: string

const deps = (fetch: typeof globalThis.fetch = async () => Response.json(models)) => ({ db: serviceSupabase(), resolveHost: publicHost, fetch })
const label = () => `${PREFIX} ${randomUUID().slice(0, 6)}`
const judge = { module: 'decision', adapter: 'openai_responses', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-6.1-sol', apiKey: KEY }
const ark = {
  module: 'image', adapter: 'ark_images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-fixture', apiKey: KEY,
  resolutions: ['1k', '2k'], estimatedImageCosts: { '1k': 0.03, '2k': 0.05 },
}

beforeAll(async () => {
  pg = await connectAdmin()
  adminId = await createUser(pg)
  await pg.query("update public.profiles set role = 'admin' where id = $1", [adminId])
})

afterAll(async () => {
  await pg.query('delete from public.ai_providers where label like $1', [`${PREFIX}%`])
  await pg.end()
})

describe('catalogue price on a text line', () => {
  it('stores the catalogue price with fetchedAt on save, and the row reads it back', async () => {
    const id = await saveProvider(deps(), adminId, { ...judge, label: label() })
    const row = await findProvider(serviceSupabase(), id)
    expect(row?.catalogPrice).toMatchObject({ status: 'quoted', catalogModel: 'openai/gpt-6.1-sol', prices: { inputTextPerM: 2, outputPerM: 10 } })
    expect(Date.parse(row!.catalogPrice!.fetchedAt)).toBeGreaterThan(Date.now() - 60_000)
    expect(row?.prices).toEqual({ inputTextPerM: null, inputImagePerM: null, outputPerM: null })
  })

  it('keeps the last snapshot when a refresh cannot read the catalogue, and updates it when it can', async () => {
    const id = await saveProvider(deps(), adminId, { ...judge, label: label() })
    const before = (await findProvider(serviceSupabase(), id))!.catalogPrice
    await expect(refreshCatalogPrice(deps(async () => new Response(null, { status: 503 })), (await findProvider(serviceSupabase(), id))!)).rejects.toThrow()
    expect((await findProvider(serviceSupabase(), id))?.catalogPrice).toEqual(before)
    const raised = { data: [{ id: 'openai/gpt-6.1-sol', pricing: { prompt: '0.000003', completion: '0.000012' } }] }
    expect(await refreshCatalogPrice(deps(async () => Response.json(raised)), (await findProvider(serviceSupabase(), id))!)).toBe(true)
    expect((await findProvider(serviceSupabase(), id))?.catalogPrice?.prices).toEqual({ inputTextPerM: 3, inputImagePerM: null, outputPerM: 12 })
  })
})

describe('admin-entered Ark list price', () => {
  it('saves and reads back the typed price with its source and date', async () => {
    const id = await saveProvider(deps(), adminId, { ...ark, label: label(), listPrice: LIST_PRICE })
    expect((await findProvider(serviceSupabase(), id))?.listPrice).toEqual(LIST_PRICE)
    // An older editor that sends none keeps it.
    await saveProvider(deps(), adminId, { ...ark, id, apiKey: '', label: label() })
    expect((await findProvider(serviceSupabase(), id))?.listPrice).toEqual(LIST_PRICE)
  })

  it('refuses a non-admin, a price without its source, and a line that is not Ark', async () => {
    const id = await saveProvider(deps(), adminId, { ...ark, label: label(), listPrice: LIST_PRICE })
    const stranger = await createUser(pg)
    const call = (actor: string, target: string, price: unknown) =>
      serviceSupabase().rpc('admin_set_provider_list_price', { p_actor: actor, p_id: target, p_price: price })
    expect((await call(stranger, id, LIST_PRICE)).error?.message).toContain('NOT_ADMIN')
    expect((await call(adminId, id, { ...LIST_PRICE, source: 'example.com' })).error?.message).toContain('INVALID_INPUT')
    expect((await call(adminId, id, { ...LIST_PRICE, asOf: 'today' })).error?.message).toContain('INVALID_INPUT')
    expect((await call(adminId, id, { ...LIST_PRICE, outputBands: [{ maxPixels: null, cny: -1 }] })).error?.message).toContain('INVALID_INPUT')
    expect((await call(adminId, id, { ...LIST_PRICE, outputBands: [{ maxPixels: 0, cny: 0.1 }] })).error?.message).toContain('INVALID_INPUT')
    expect((await call(adminId, id, { ...LIST_PRICE, outputBands: [] })).error?.message).toContain('INVALID_INPUT')
    const text = await saveProvider(deps(), adminId, { ...judge, label: label() })
    expect((await call(adminId, text, LIST_PRICE)).error?.message).toContain('PROVIDER_NOT_FOUND')
  })

  it('is not callable by client roles', async () => {
    const { error } = await anonSupabase().rpc('admin_set_provider_list_price', { p_actor: adminId, p_id: randomUUID(), p_price: LIST_PRICE })
    expect(error).not.toBeNull()
  })
})
