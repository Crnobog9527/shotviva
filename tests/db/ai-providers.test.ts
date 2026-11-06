import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activateProvider, runProviderAction, saveProvider, testProvider } from '@/core/admin'
import { runGeneration, type GenerationProvider } from '@/core/jobs'
import { listProviders, loadActiveProviderRow, readProviderKey, resolveProvider, setProviderKey } from '@/core/providers'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { anonClient, connectAdmin, createUser } from './helpers'
import { providerEnv, publicHost, recordingAdapters } from './provider-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T17 / T17b: ai_providers is private, keys live in Supabase Vault, one provider is active per
// module, the admin commands validate base_url and never hand a key back, and generation calls
// whatever is active (ARCHITECTURE §3.3). One file on purpose: these tests share the single active row per module, and vitest
// runs separate files in parallel.

const PREFIX = 'T17 table'
const KEY = 'sk-t17-table-secret-0123456789'

let pg: Client
let adminId: string

const deps = () => ({ db: serviceSupabase(), resolveHost: publicHost })
const save = (input: Record<string, unknown>) =>
  saveProvider(deps(), adminId, { label: `${PREFIX} ${randomUUID().slice(0, 6)}`, baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-2.6', apiKey: KEY, ...input })

async function activeIds(): Promise<string[]> {
  const { rows } = await pg.query<{ id: string }>("select id from public.ai_providers where module = 'image' and is_active")
  return rows.map((row) => row.id)
}

beforeAll(async () => {
  pg = await connectAdmin()
  adminId = await createUser(pg)
})

afterAll(async () => {
  await pg.query('delete from public.ai_providers where label like $1', [`${PREFIX}%`])
  await pg.end()
})

describe('ai_providers privacy', () => {
  it('refuses anon and authenticated, through the Data API and in SQL', async () => {
    await save({})
    const { data } = await anonSupabase().from('ai_providers').select('*')
    expect(data ?? []).toEqual([])
    for (const role of ['anon', 'authenticated']) {
      await pg.query('begin')
      await pg.query(`set local role ${role}`)
      await expect(pg.query('select * from public.ai_providers')).rejects.toThrow(/permission denied/)
      await pg.query('rollback')
      await pg.query('begin')
      await pg.query(`set local role ${role}`)
      await expect(pg.query('select public.admin_activate_provider(gen_random_uuid())')).rejects.toThrow(/permission denied/)
      await pg.query('rollback')
    }
  })

  it('never returns the key from the listing or any admin command', async () => {
    const id = await save({})
    const listing = JSON.stringify(await listProviders(serviceSupabase()))
    expect(listing).toContain(id)
    expect(listing).not.toContain(KEY)
    expect(listing).not.toContain('vault')
    expect(listing).toContain('6789')
    const results = [
      await runProviderAction(() => save({})),
      await runProviderAction(() => testProvider({ ...deps(), fetch: async () => new Response('{}', { status: 401 }) }, { id })),
      await runProviderAction(() => activateProvider(deps(), adminId, { id })),
    ]
    for (const result of results) expect(JSON.stringify(result)).not.toContain(KEY)
  })
})

describe('admin_activate_provider', () => {
  it('leaves exactly one active provider per module, even when two switches race', async () => {
    const [a, b, c] = [await save({}), await save({}), await save({})]
    await activateProvider(deps(), adminId, { id: a })
    expect(await activeIds()).toEqual([a])
    await Promise.all([activateProvider(deps(), adminId, { id: b }), activateProvider(deps(), adminId, { id: c })])
    const active = await activeIds()
    expect(active).toHaveLength(1)
    expect([b, c]).toContain(active[0])
  })

  it('is backed by a partial unique index and an https check', async () => {
    const [a, b] = [await save({}), await save({})]
    await activateProvider(deps(), adminId, { id: a })
    await expect(pg.query('update public.ai_providers set is_active = true where id = $1', [b])).rejects.toThrow(/ai_providers_one_active_per_module/)
    await expect(pg.query("update public.ai_providers set base_url = 'http://api.openai.com/v1' where id = $1", [b])).rejects.toThrow(/check constraint/)
  })

  it('reports an unknown id', async () => {
    const result = await runProviderAction(() => activateProvider(deps(), adminId, { id: randomUUID() }))
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('saveProvider', () => {
  it.each([
    ['http://api.openai.com/v1', 'base_url_not_https'],
    ['https://localhost/v1', 'base_url_private'],
    ['https://127.0.0.1/v1', 'base_url_private'],
    ['https://10.0.0.8/v1', 'base_url_private'],
    ['https://192.168.1.2/v1', 'base_url_private'],
    ['https://169.254.169.254/v1', 'base_url_private'],
  ])('refuses %s and stores nothing', async (baseUrl, reason) => {
    const label = `${PREFIX} refused ${randomUUID().slice(0, 6)}`
    expect(await runProviderAction(() => save({ label, baseUrl }))).toEqual({ ok: false, reason })
    const { rows } = await pg.query('select 1 from public.ai_providers where label = $1', [label])
    expect(rows).toHaveLength(0)
  })

  it('needs a key for a new row and leaves no keyless row behind', async () => {
    const label = `${PREFIX} keyless ${randomUUID().slice(0, 6)}`
    expect(await runProviderAction(() => save({ label, apiKey: '' }))).toEqual({ ok: false, reason: 'api_key_required' })
    const { rows } = await pg.query('select 1 from public.ai_providers where label = $1', [label])
    expect(rows).toHaveLength(0)
  })

  it('refuses a malformed key before and inside SQL', async () => {
    expect(await runProviderAction(() => save({ apiKey: 'has space 0123456789' }))).toEqual({ ok: false, reason: 'api_key_invalid' })
    expect(await runProviderAction(() => save({ apiKey: 'short' }))).toEqual({ ok: false, reason: 'api_key_invalid' })
    const id = await save({})
    for (const bad of ['short', 'sk-with space-0123456789', `sk-${'x'.repeat(1030)}`, 'sk-\u00e9-0123456789abcd']) {
      expect(await runProviderAction(() => setProviderKey(serviceSupabase(), id, bad))).toEqual({ ok: false, reason: 'api_key_invalid' })
    }
    expect(await readProviderKey(serviceSupabase(), id)).toBe(KEY)
  })
})

describe('provider keys in Supabase Vault', () => {
  async function vaultRow(id: string) {
    const { rows } = await pg.query<{ vault_secret_id: string | null; api_key_last4: string | null }>(
      'select vault_secret_id, api_key_last4 from public.ai_providers where id = $1',
      [id],
    )
    const row = rows[0]
    const secrets = await pg.query<{ id: string; name: string; secret: string }>(
      'select id, name, decrypted_secret as secret from vault.decrypted_secrets where id = $1 or name = $2',
      [row?.vault_secret_id ?? '00000000-0000-0000-0000-000000000000', `shotviva.provider.${id}`],
    )
    return { row, secrets: secrets.rows }
  }

  it('stores, replaces and clears a key', async () => {
    const id = await save({})
    const stored = await vaultRow(id)
    expect(stored.row?.api_key_last4).toBe('6789')
    expect(stored.secrets).toEqual([{ id: stored.row?.vault_secret_id, name: `shotviva.provider.${id}`, secret: KEY }])
    expect(await readProviderKey(serviceSupabase(), id)).toBe(KEY)

    const replacement = 'sk-t17-replacement-key-abcd'
    await save({ id, apiKey: replacement })
    const replaced = await vaultRow(id)
    expect(replaced.row).toEqual({ vault_secret_id: stored.row?.vault_secret_id, api_key_last4: 'abcd' })
    expect(replaced.secrets.map((secret) => secret.secret)).toEqual([replacement])

    await setProviderKey(serviceSupabase(), id, null)
    const cleared = await vaultRow(id)
    expect(cleared.row).toEqual({ vault_secret_id: null, api_key_last4: null })
    expect(cleared.secrets).toEqual([])
    expect(await readProviderKey(serviceSupabase(), id)).toBeNull()
    expect(await runProviderAction(() => testProvider(deps(), { id }))).toEqual({ ok: false, reason: 'api_key_missing' })
    expect(await runProviderAction(() => activateProvider(deps(), adminId, { id }))).toEqual({ ok: false, reason: 'api_key_missing' })
  })

  it('keeps the stored key when an edit leaves the key blank', async () => {
    const id = await save({})
    const before = await vaultRow(id)
    await save({ id, apiKey: '', model: 'gpt-image-2.5-sunburst' })
    expect(await vaultRow(id)).toEqual(before)
  })

  it('deletes the Vault secret with the provider', async () => {
    const id = await save({})
    const { row } = await vaultRow(id)
    await pg.query('delete from public.ai_providers where id = $1', [id])
    const { rows } = await pg.query('select 1 from vault.secrets where id = $1', [row?.vault_secret_id])
    expect(rows).toHaveLength(0)
  })

  it('keeps vault and the key functions out of reach of client roles', async () => {
    const id = await save({})
    for (const role of ['anon', 'authenticated']) {
      for (const sql of [
        'select * from vault.secrets',
        'select * from vault.decrypted_secrets',
        `select public.provider_api_key('${id}')`,
        `select public.admin_set_provider_key('${id}', 'sk-stolen-0123456789')`,
      ]) {
        await pg.query('begin')
        await pg.query(`set local role ${role}`)
        await expect(pg.query(sql)).rejects.toThrow(/permission denied/)
        await pg.query('rollback')
      }
    }
    const viaApi = await anonClient().rpc('provider_api_key', { p_id: id })
    expect(viaApi.data).toBeNull()
    expect(viaApi.error).not.toBeNull()
    expect(await readProviderKey(serviceSupabase(), id)).toBe(KEY)
  })
})

describe('generation through the active provider', () => {
  async function generate(provider: GenerationProvider, templateId: string) {
    const userId = await createUser(pg, { credits: 3 })
    const r2 = createMemoryStore()
    const inputKey = newInputKey(userId, 'image/jpeg')
    r2.upload(inputKey, await jpeg(1024, 1024), 'image/jpeg')
    const request = { userId, source: 'web' as const, templateId, inputKey, copy: { dish: 'ramen' }, aspectRatio: '4:5' }
    const view = await runGeneration({ db: serviceSupabase(), store: r2.store, provider }, request)
    const { rows } = await pg.query<{ provider: string }>('select provider from public.generation_jobs where id = $1', [view.id])
    return { view, jobProvider: rows[0]?.provider }
  }

  it("calls the active row's address, model and key, ignores model_params.model and tags the job", async () => {
    const templateId = await seedTemplate(pg)
    await pg.query(
      `update public.template_prompts set model_params = '{"model": "gpt-image-old", "background": "opaque"}' where template_id = $1`,
      [templateId],
    )
    const relayKey = 'sk-relay-t17-abcdefghijkl'
    const id = await save({ baseUrl: 'https://relay.example.com/v1/', model: 'gpt-image-2.6', apiKey: relayKey })
    await activateProvider(deps(), adminId, { id })

    const { adapters, calls } = await recordingAdapters()
    const readKey = (providerId: string) => readProviderKey(serviceSupabase(), providerId)
    const provider = await resolveProvider('image', await loadActiveProviderRow(serviceSupabase(), 'image'), providerEnv(), adapters, readKey)
    const { view, jobProvider } = await generate(provider, templateId)

    expect(view.status).toBe('succeeded')
    expect(calls).toEqual([{ url: 'https://relay.example.com/v1/images/edits', authorization: `Bearer ${relayKey}`, model: 'gpt-image-2.6' }])
    expect(jobProvider).toBe(`${id}/gpt-image-2.6`)
  })

  it('falls back to OPENAI_* when no provider is active', async () => {
    const templateId = await seedTemplate(pg)
    await pg.query("update public.ai_providers set is_active = false where module = 'image' and is_active")
    const row = await loadActiveProviderRow(serviceSupabase(), 'image')
    expect(row).toBeNull()

    const { adapters, calls } = await recordingAdapters()
    const env = providerEnv({ OPENAI_API_KEY: 'sk-env-t17-0123456789', OPENAI_IMAGE_MODEL: 'gpt-image-2.5-sunburst' })
    const provider = await resolveProvider('image', row, env, adapters, (providerId) => readProviderKey(serviceSupabase(), providerId))
    const { view, jobProvider } = await generate(provider, templateId)

    expect(view.status).toBe('succeeded')
    expect(calls).toEqual([
      { url: 'https://api.openai.com/v1/images/edits', authorization: 'Bearer sk-env-t17-0123456789', model: 'gpt-image-2.5-sunburst' },
    ])
    expect(jobProvider).toBe('env/gpt-image-2.5-sunburst')
  })
})

describe('provider prices (T33)', () => {
  it('saves, lists and clears the three per-million prices, and the active row carries them', async () => {
    const id = await save({ priceInputTextPerM: '5', priceInputImagePerM: '8', priceOutputPerM: '30' })
    const listed = (await listProviders(serviceSupabase())).find((p) => p.id === id)
    expect(listed?.prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })

    await activateProvider(deps(), adminId, { id })
    expect((await loadActiveProviderRow(serviceSupabase(), 'image'))?.prices).toEqual({ inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 })

    await save({ id, apiKey: '', priceInputTextPerM: '', priceInputImagePerM: '8', priceOutputPerM: '30' })
    expect((await listProviders(serviceSupabase())).find((p) => p.id === id)?.prices.inputTextPerM).toBeNull()
  })

  it('refuses a negative price in the command and in SQL', async () => {
    await expect(save({ priceOutputPerM: '-1' })).rejects.toMatchObject({ reason: 'invalid_input' })
    await expect(pg.query(`update public.ai_providers set price_output_per_m = -1 where label like $1`, [`${PREFIX}%`])).rejects.toThrow(
      /ai_providers_prices_nonnegative/,
    )
  })
})
