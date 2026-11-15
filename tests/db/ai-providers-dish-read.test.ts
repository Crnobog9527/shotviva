import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activateProvider, saveProvider } from '@/core/admin'
import { activeCredentials, loadActiveProviderRow, readProviderKey } from '@/core/providers'

import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'

// 1564–1565: the food templates' dish reading has its own module (ARCHITECTURE §5.1c), a text line
// like 'decision' with its own active row. The only file that switches dish_read rows.

const PREFIX = 'dish-read line'
const KEY = 'sk-or-dish-read-secret-0123456789'

let pg: Client
let adminId: string

// No network: the catalogue is unreachable, so the hand-entered prices are what jobs are costed with.
const offline = async () => new Response(null, { status: 503 })
const deps = () => ({ db: serviceSupabase(), resolveHost: publicHost, fetch: offline })
const save = () => saveProvider(deps(), adminId, {
  label: `${PREFIX} ${randomUUID().slice(0, 6)}`, module: 'dish_read', adapter: 'openai_responses',
  baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-6-sol', apiKey: KEY,
  priceInputTextPerM: 3, priceOutputPerM: 12,
})

beforeAll(async () => {
  pg = await connectAdmin()
  adminId = await createUser(pg)
  await pg.query("update public.profiles set role = 'admin' where id = $1", [adminId])
})

afterAll(async () => {
  await pg.query('delete from public.ai_providers where label like $1', [`${PREFIX}%`])
  await pg.end()
})

describe('dish-reading providers', () => {
  it('saves a dish-reading row like a decision row: Responses only, the default tiers', async () => {
    const id = await save()
    const { rows } = await pg.query('select module, adapter, resolutions from public.ai_providers where id = $1', [id])
    expect(rows[0]).toEqual({ module: 'dish_read', adapter: 'openai_responses', resolutions: ['1k', '2k', '4k'] })
    await expect(pg.query(`insert into public.ai_providers (module, adapter, label, model) values ('dish_read', 'openrouter_images', $1, 'm')`,
      [`${PREFIX} bad`])).rejects.toThrow(/ai_providers_module_adapter/)
  })

  it('switches its own active row without touching the judge', async () => {
    const judgeBefore = await loadActiveProviderRow(serviceSupabase(), 'decision')
    const id = await save()
    await activateProvider(deps(), adminId, { id })
    expect((await loadActiveProviderRow(serviceSupabase(), 'decision'))?.id).toBe(judgeBefore?.id)
    const credentials = await activeCredentials('dish_read', (module) => loadActiveProviderRow(serviceSupabase(), module),
      (rowId) => readProviderKey(serviceSupabase(), rowId))
    expect(credentials).toMatchObject({ tag: `${id}/openai/gpt-6-sol`, config: { apiKey: KEY, baseUrl: 'https://openrouter.ai/api/v1' } })
    expect(credentials?.prices).toMatchObject({ inputTextPerM: 3, outputPerM: 12 })
  })
})
