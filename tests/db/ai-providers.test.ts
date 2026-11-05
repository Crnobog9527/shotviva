import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { activateProvider, runProviderAction, saveProvider, testProvider } from '@/core/admin'
import { runGeneration } from '@/core/jobs'
import { listProviders, loadActiveProviderRow, resolveProvider } from '@/core/providers'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { providerEnv, publicHost, recordingAdapters } from './provider-fixtures'
import { anonSupabase, serviceSupabase } from './supabase-env'

// T17: ai_providers is private, one provider is active per module, the admin commands validate
// base_url and never hand a key back, and generation calls whatever is active (ARCHITECTURE
// §3.3). One file on purpose: these tests share the single active row per module, and vitest
// runs separate files in parallel.

const PREFIX = 'T17 table'
const KEY = 'sk-t17-table-secret-0123456789'

let pg: Client
let adminId: string

const deps = () => ({ db: serviceSupabase(), env: providerEnv(), resolveHost: publicHost })
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

  it('never returns the key or its ciphertext from the admin commands', async () => {
    const id = await save({})
    const listing = JSON.stringify(await listProviders(serviceSupabase()))
    const { rows } = await pg.query<{ api_key_ciphertext: string }>('select api_key_ciphertext from public.ai_providers where id = $1', [id])
    expect(listing).toContain(id)
    expect(listing).not.toContain(KEY)
    expect(listing).not.toContain(rows[0]?.api_key_ciphertext)
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

  it('needs a key for a new row and keeps the stored key when an edit leaves it blank', async () => {
    expect(await runProviderAction(() => save({ apiKey: '' }))).toEqual({ ok: false, reason: 'api_key_required' })
    const id = await save({})
    const before = await pg.query<{ api_key_ciphertext: string }>('select api_key_ciphertext from public.ai_providers where id = $1', [id])
    await save({ id, apiKey: '', model: 'gpt-image-2.5-sunburst' })
    const after = await pg.query<{ api_key_ciphertext: string; model: string }>(
      'select api_key_ciphertext, model from public.ai_providers where id = $1',
      [id],
    )
    expect(after.rows[0]).toEqual({ api_key_ciphertext: before.rows[0]?.api_key_ciphertext, model: 'gpt-image-2.5-sunburst' })
  })

  it('tells the admin to re-enter the key after PROVIDER_SECRETS_KEY changed', async () => {
    const id = await save({})
    const rotated = { ...deps(), env: providerEnv({ PROVIDER_SECRETS_KEY: Buffer.alloc(32, 7).toString('base64') }) }
    expect(await runProviderAction(() => testProvider(rotated, { id }))).toEqual({ ok: false, reason: 'secret_unreadable' })
  })
})

describe('generation through the active provider', () => {
  async function generate(provider: Awaited<ReturnType<typeof resolveProvider>>, templateId: string) {
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
    const provider = resolveProvider('image', await loadActiveProviderRow(serviceSupabase(), 'image'), providerEnv(), adapters)
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
    const { view, jobProvider } = await generate(resolveProvider('image', row, env, adapters), templateId)

    expect(view.status).toBe('succeeded')
    expect(calls).toEqual([
      { url: 'https://api.openai.com/v1/images/edits', authorization: 'Bearer sk-env-t17-0123456789', model: 'gpt-image-2.5-sunburst' },
    ])
    expect(jobProvider).toBe('env/gpt-image-2.5-sunburst')
  })
})
