import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { runGeneration, type ProviderInput } from '@/core/jobs'
import { activeProvider, findProviderRow, templateImageProvider, ProviderSettingError, type OpenRouterImageParameters, type ProviderAdapters } from '@/core/providers'
import { runTestGenerate, saveTestBudget } from '@/modules/image'
import { createOpenRouterImageProvider } from '@/modules/image/provider/openrouter-image-provider'

import { png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

const routerId = randomUUID()
const defaultId = randomUUID()
const model = 'google/gemini-2.5-flash-image'
const routerTag = `${routerId}/${model}`
const defaultTag = `${defaultId}/gpt-image-2.6`
const usage = { prompt_tokens: 14, completion_tokens: 22, cost: 0.04, is_byok: false }
const chargedUsd = 0.0422
const openAiUsage = { input_text_tokens: 0, input_image_tokens: 0, output_tokens: 1000 }
const supported: OpenRouterImageParameters = {
  aspect_ratio: { type: 'enum', values: ['4:5', '1:1'] },
  input_references: { type: 'range', min: 0, max: 3 },
}
let pg: Client
let templateId: string

beforeAll(async () => {
  pg = await connectAdmin()
  templateId = await seedTemplate(pg, { visibleIn: ['web', 'partner'], images: { min: 0, max: 1 } })
  await pg.query(`insert into public.ai_providers (id, module, adapter, label, model, base_url, resolutions, price_output_per_m)
    values ($1, 'image', 'openrouter_images', 'T92 routing fixture', $2, 'https://openrouter.ai/api/v1', '{1k}', null),
           ($3, 'image', 'openai_images', 'T92 fallback fixture', 'gpt-image-2.6', 'https://api.openai.com/v1', '{1k,2k,3k}', 2)`, [routerId, model, defaultId])
  await pg.query('update public.ai_providers set capabilities = $2 where id = $1', [routerId, {
    resolutions: ['1k'], aspectRatios: ['4:5', '1:1'], originalRatio: false,
    minReferences: 0, maxReferences: 3, catalogImageCosts: { '1k': 0.01 }, fetchedAt: new Date().toISOString(),
  }])
  await pg.query('update public.template_prompts set provider_id = $1 where template_id = $2', [routerId, templateId])
})
afterAll(async () => {
  await pg.query('update public.template_prompts set provider_id = null where template_id = $1', [templateId])
  await pg.query('delete from public.ai_providers where id in ($1, $2)', [routerId, defaultId])
  await pg.end()
})

async function setup() {
  const db = serviceSupabase()
  const bytes = await png(48, 48)
  const b64_json = Buffer.from(bytes).toString('base64')
  const openai = vi.fn(async () => ({ bytes, contentType: 'image/png' as const, usage: openAiUsage }))
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ b64_json }], usage }))
  const adapters: ProviderAdapters = {
    openai_images: () => ({ id: 'openai', generate: openai }),
    openrouter_images: (config) => createOpenRouterImageProvider({ ...config, fetch }),
  }
  // Share the real resolver and query. Inject our private default row so the tests never
  // switch the global active provider while the other DB suites are running.
  const row = (id: string) => findProviderRow(db, id)
  const key = async () => 'fixture'
  const fallback = () => activeProvider('image', adapters, () => row(defaultId), key)
  const parameters = vi.fn(async () => supported)
  const provider = (id: string | null, request: Pick<ProviderInput, 'resolution' | 'aspectRatio' | 'images'>) =>
    templateImageProvider(adapters, id, request, { lookup: row, fallback, readKey: key, parameters })
  return { deps: { db, provider, store: createMemoryStore().store }, fetch, openai, parameters }
}

async function jobRow(id: string) {
  return (await pg.query(
    'select provider, provider_usage, cost_usd::float8, status, credits_cost from public.generation_jobs where id = $1', [id],
  )).rows[0]
}

describe('T92 per-template generation routing', () => {
  it('runs eligible web requests on the saved model, rejects HD without charging, and preserves partner routing', async () => {
    const { deps, fetch, openai } = await setup()
    const userId = await createUser(pg, { credits: 5 })
    const request = { userId, templateId, aspectRatio: '4:5', source: 'web' as const }
    const standard = await runGeneration(deps, { ...request, resolution: '1k' })
    await expect(runGeneration(deps, { ...request, resolution: '2k' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(runGeneration(deps, { ...request, aspectRatio: 'original' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const partner = await runGeneration(deps, { ...request, source: 'graylum', idempotencyKey: randomUUID() })
    expect(await jobRow(standard.id)).toMatchObject({ provider: routerTag, provider_usage: usage, cost_usd: chargedUsd, status: 'succeeded', credits_cost: 1 })
    expect(await jobRow(partner.id)).toMatchObject({ provider: defaultTag, status: 'succeeded', credits_cost: 1 })
    expect((await profileOf(pg, userId)).credits).toBe(3)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(openai).toHaveBeenCalledTimes(1)
  })

  it('refunds the failed request and retains its reported OpenRouter cost', async () => {
    const { deps, fetch } = await setup()
    const userId = await createUser(pg, { credits: 2 })
    const jobId = randomUUID()
    fetch.mockResolvedValueOnce(Response.json({ data: [], usage }))
    await expect(runGeneration(deps, { jobId, userId, templateId, source: 'web' })).rejects.toMatchObject({ refunded: true })
    expect(await jobRow(jobId)).toMatchObject({ provider: routerTag, status: 'failed', provider_usage: usage, cost_usd: chargedUsd })
    expect((await profileOf(pg, userId)).credits).toBe(2)
  })

  it('returns the held credits while retaining a pending OpenRouter receipt on a failed request', async () => {
    const { deps, fetch } = await setup()
    const userId = await createUser(pg, { credits: 2 })
    const jobId = randomUUID()
    fetch.mockResolvedValueOnce(Response.json({ id: 'gen-pending', data: [] }))
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(runGeneration(deps, { jobId, userId, templateId, source: 'web' })).rejects.toMatchObject({ refunded: true })
    expect(await jobRow(jobId)).toMatchObject({ status: 'failed', provider_usage: { generation_id: 'gen-pending', cost: null }, cost_usd: null })
    expect((await profileOf(pg, userId)).credits).toBe(2)
  })

  it('admin trials can temporarily use the global default, then follow the saved model again', async () => {
    const releaseBudget = await holdTestBudget(pg)
    try {
      const { deps } = await setup()
      const admin = await createUser(pg)
      await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
      await saveTestBudget(deps.db, admin, 1000)
      const body = () => ({ run_id: randomUUID(), batch_id: randomUUID(), template_id: templateId, inputs: { aspect_ratio: '4:5' as const } })
      const override = await runTestGenerate(deps, { actorId: admin, body: { ...body(), provider_id: null } })
      const saved = await runTestGenerate(deps, { actorId: admin, body: body() })
      expect(override).toMatchObject({ status: 'succeeded', provider: defaultTag })
      expect(saved).toMatchObject({ status: 'succeeded', provider: routerTag, costUsd: chargedUsd })
      const spend = await pg.query('select provider, cost_usd::float8, has_openrouter from public.admin_test_spend where run_id = $1', [saved.id])
      expect(spend.rows[0]).toEqual({ provider: routerTag, cost_usd: chargedUsd, has_openrouter: true })
    } finally {
      await releaseBudget()
    }
  }, 120_000)
})

describe('OpenRouter catalogue fallback', () => {
  it('finishes a catalogue fallback with one debit, the actual default model and its token pricing', async () => {
    const { deps, fetch, openai, parameters } = await setup()
    parameters.mockRejectedValueOnce(new ProviderSettingError('openrouter_catalog_unavailable', 'Catalogue unavailable'))
    const userId = await createUser(pg, { credits: 2 })
    const job = await runGeneration(deps, { userId, templateId, source: 'web', aspectRatio: '4:5', resolution: '1k' })
    expect(await jobRow(job.id)).toMatchObject({
      provider: defaultTag, status: 'succeeded', provider_usage: openAiUsage, cost_usd: 0.002, credits_cost: 1,
    })
    expect((await profileOf(pg, userId)).credits).toBe(1)
    expect(openai).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refunds and attributes the job to the default when that one generation attempt fails', async () => {
    const { deps, fetch, openai, parameters } = await setup()
    parameters.mockRejectedValueOnce(new ProviderSettingError('openrouter_catalog_unavailable', 'Catalogue unavailable'))
    openai.mockRejectedValueOnce(new Error('Default provider unavailable'))
    const userId = await createUser(pg, { credits: 2 })
    const jobId = randomUUID()
    await expect(runGeneration(deps, { jobId, userId, templateId, source: 'web', resolution: '1k' }))
      .rejects.toMatchObject({ jobId, refunded: true })
    expect(await jobRow(jobId)).toMatchObject({ provider: defaultTag, status: 'failed', provider_usage: null, cost_usd: null })
    expect((await profileOf(pg, userId)).credits).toBe(2)
    expect(openai).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })
})
