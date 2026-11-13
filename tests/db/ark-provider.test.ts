import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveProvider } from '@/core/admin/providers'
import { findProvider } from '@/core/providers'
import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'

// Migration 1330: an 'ark_images' image row saves with the code's fixed capabilities (1k/2k,
// up to 10 references) and its per-image estimates; nothing is fetched from the vendor.
let pg: Client
let admin: string
const label = 'Ark provider ' + randomUUID()

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
})
afterAll(async () => {
  await pg.query('delete from public.ai_providers where label=$1', [label])
  await pg.end()
})

describe('ark_images provider rows', () => {
  it('saves 1k/2k capabilities and estimates without calling the vendor', async () => {
    const fetch = async () => { throw new Error('no network for ark capabilities') }
    const id = await saveProvider({ db: serviceSupabase(), resolveHost: publicHost, fetch }, admin, {
      label, adapter: 'ark_images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-5-5-261028',
      apiKey: 'ark-local-only-fixture-key', estimatedImageCosts: { '1k': 0.05, '2k': 0.07 },
    })
    const row = await findProvider(serviceSupabase(), id)
    expect(row).toMatchObject({ adapter: 'ark_images', resolutions: ['1k', '2k'], estimatedImageCosts: { '1k': 0.05, '2k': 0.07 } })
    expect(row?.capabilities).toMatchObject({ resolutions: ['1k', '2k'], originalRatio: true, minReferences: 0, maxReferences: 10 })
  })

  it('still rejects ark_images for the decision module', async () => {
    await expect(pg.query(
      "insert into public.ai_providers (module, adapter, label, base_url, model) values ('decision', 'ark_images', $1, 'https://ark.cn-beijing.volces.com/api/v3', 'x')",
      [label + ' decision'],
    )).rejects.toThrow(/ai_providers_module_adapter/)
  })
})
