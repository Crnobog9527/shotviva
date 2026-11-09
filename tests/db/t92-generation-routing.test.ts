import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { runGeneration } from '@/core/jobs'
import { activeProvider, findProviderRow, templateImageProvider, type ProviderAdapters } from '@/core/providers'
import type { Resolution } from '@/core/templates'
import { runTestGenerate, saveTestBudget } from '@/modules/image'
import { createOpenRouterImageProvider } from '@/modules/image/provider/openrouter-image-provider'

import { png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { recordingAdapters } from './provider-fixtures'
import { serviceSupabase } from './supabase-env'
import { holdTestBudget } from './test-run-fixtures'

const routerId = randomUUID()
const defaultId = randomUUID()
const model = 'google/gemini-2.5-flash-image'
const routerTag = `${routerId}/${model}`
const defaultTag = `${defaultId}/gpt-image-2.6`
const usage = { prompt_tokens: 14, completion_tokens: 22, cost: 0.04 }
const chargedUsd = 0.0422
let pg: Client
let templateId: string

beforeAll(async () => {
  pg = await connectAdmin()
  templateId = await seedTemplate(pg, { visibleIn: ['web', 'partner'], images: { min: 0, max: 1 } })
  await pg.query(`insert into public.ai_providers (id, module, adapter, label, model, base_url, resolutions)
    values ($1, 'image', 'openrouter_images', 'T92 routing fixture', $2, 'https://openrouter.ai/api/v1', '{1k}'),
           ($3, 'image', 'openai_images', 'T92 fallback fixture', 'gpt-image-2.6', 'https://api.openai.com/v1', '{1k,2k,3k}')`, [routerId, model, defaultId])
  await pg.query('update public.template_prompts set provider_id = $1 where template_id = $2', [routerId, templateId])
})
afterAll(async () => {
  await pg.query('update public.template_prompts set provider_id = null where template_id = $1', [templateId])
  await pg.query('delete from public.ai_providers where id in ($1, $2)', [routerId, defaultId])
  await pg.end()
})

async function setup() {
  const db = serviceSupabase()
  const openai = await recordingAdapters()
  const b64_json = Buffer.from(await png(48, 48)).toString('base64')
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ b64_json }], usage }))
  const adapters: ProviderAdapters = {
    ...openai.adapters,
    openrouter_images: (config) => createOpenRouterImageProvider({ ...config, fetch }),
  }
  // Share the real resolver and query. Inject our private default row so the tests never
  // switch the global active provider while the other DB suites are running.
  const row = (id: string) => findProviderRow(db, id)
  const key = async () => 'fixture'
  const fallback = () => activeProvider('image', adapters, () => row(defaultId), key)
  const provider = (id: string | null, tier: Resolution) => templateImageProvider(adapters, id, tier, row, fallback, key)
  return { deps: { db, provider, store: createMemoryStore().store }, fetch, openai }
}

async function jobRow(id: string) {
  return (await pg.query(
    'select provider, provider_usage, cost_usd::float8, status, credits_cost from public.generation_jobs where id = $1', [id],
  )).rows[0]
}

describe('T92 per-template generation routing', () => {
  it('runs eligible web requests on the saved model, and uses the default for HD and partner requests', async () => {
    const { deps, fetch, openai } = await setup()
    const userId = await createUser(pg, { credits: 5 })
    const request = { userId, templateId, aspectRatio: '4:5', source: 'web' as const }
    const standard = await runGeneration(deps, { ...request, resolution: '1k' })
    const hd = await runGeneration(deps, { ...request, resolution: '2k' })
    const partner = await runGeneration(deps, { ...request, source: 'graylum', idempotencyKey: randomUUID() })
    expect(await jobRow(standard.id)).toMatchObject({ provider: routerTag, provider_usage: usage, cost_usd: chargedUsd, status: 'succeeded', credits_cost: 1 })
    expect(await jobRow(hd.id)).toMatchObject({ provider: defaultTag, status: 'succeeded', credits_cost: 2 })
    expect(await jobRow(partner.id)).toMatchObject({ provider: defaultTag, status: 'succeeded', credits_cost: 1 })
    expect((await profileOf(pg, userId)).credits).toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(openai.calls).toHaveLength(2)
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

  it('admin trials can temporarily use the global default, then follow the saved model again', async () => {
    const releaseBudget = await holdTestBudget(pg)
    try {
      const { deps } = await setup()
      const admin = await createUser(pg)
      await pg.query("update public.profiles set role = 'admin' where id = $1", [admin])
      await saveTestBudget(deps.db, admin, 1000)
      const body = () => ({ run_id: randomUUID(), batch_id: randomUUID(), template_id: templateId, inputs: {} })
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
