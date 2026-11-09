import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { saveProvider } from '@/core/admin/providers'
import { refreshProviderCapabilities } from '@/core/admin/providers/refresh-capabilities'
import { findProvider, persistRefreshedCapabilities } from '@/core/providers'
import { connectAdmin, createUser } from './helpers'
import { publicHost } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'

let pg: Client
let admin: string
const label = 'T96 provider ' + randomUUID()
const model = 'fixture/model'
const settings = { label, adapter: 'openrouter_images', baseUrl: 'https://router.example/v1', model, apiKey: 'T96-local-only-fixture' }
const db = () => serviceSupabase()
const deps = (resolution: string) => ({
  db: db(), resolveHost: publicHost,
  fetch: async () => Response.json({ data: [{ id: model, supported_parameters: { resolution: { type: 'enum', values: [resolution] } } }] }),
})

beforeAll(async () => {
  pg = await connectAdmin()
  admin = await createUser(pg)
  await pg.query("update public.profiles set role='admin' where id=$1", [admin])
})
afterAll(async () => {
  await pg.query('delete from public.ai_providers where label=$1', [label])
  await pg.end()
})

describe('T96 stored provider capabilities', () => {
  it('writes both tier representations, preserves the last good refresh, and rejects a stale concurrent writer', async () => {
    const id = await saveProvider(deps('1K'), admin, { ...settings, estimatedImageCosts: { '1k': 0.01 } })
    const first = await findProvider(db(), id)
    expect(first).toMatchObject({ resolutions: ['1k'], capabilities: { resolutions: ['1k'] }, estimatedImageCosts: { '1k': 0.01 } })
    if (!first?.capabilities) throw new Error('Missing snapshot')
    await refreshProviderCapabilities(deps('2K'), { id })
    const second = await findProvider(db(), id)
    expect(second).toMatchObject({ resolutions: ['2k'], capabilities: { resolutions: ['2k'] } })
    expect(second?.capabilities?.fetchedAt).not.toEqual(first.capabilities.fetchedAt)
    await expect(refreshProviderCapabilities({ ...deps('1K'), fetch: async () => new Response(null, { status: 503 }) }, { id })).rejects.toThrow()
    await expect(persistRefreshedCapabilities(db(), first, first.capabilities)).rejects.toThrow('changed during refresh')
    expect(await findProvider(db(), id)).toEqual(second)
  })

  it('rejects an ordinary actor, and keeps the SQL function closed to signed-in clients', async () => {
    const ordinary = await createUser(pg)
    await expect(saveProvider(deps('1K'), ordinary, settings)).rejects.toThrow()
    const { rows } = await pg.query("select has_function_privilege('authenticated','public.admin_save_provider(uuid,uuid,jsonb,jsonb,text)','execute') as allowed")
    expect(rows[0].allowed).toBe(false)
  })
})
