import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { confirmJob, GenerationFailure, ProviderError, reserveJob, runGeneration, type GenerationProvider, type GenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg, png } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'

// T33: the provider's usage and the job's cost are written by the same confirm_job / refund_job
// call that settles the job, for failures too. Real local Supabase, fake R2 and fake provider.

let db: Client
let templateId: string

const PRICES = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
const USAGE = { input_text_tokens: 1000, input_image_tokens: 2000, output_tokens: 4000 }
// 1,000 × $5 + 2,000 × $8 + 4,000 × $30, per million.
const COST = 0.141

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

type Behaviour = 'ok' | 'billed-error' | 'hang'

function provider(behaviour: Behaviour, prices: GenerationProvider['prices']): GenerationProvider {
  return {
    id: 'fake-openai',
    prices,
    generate: vi.fn(async () => {
      if (behaviour === 'billed-error') throw new ProviderError('failed', 'openai returned no image', { usage: USAGE })
      if (behaviour === 'hang') return new Promise<never>(() => {})
      return { bytes: await png(64, 80), contentType: 'image/png' as const, usage: USAGE }
    }),
  }
}

// Every rpc() and from() the pipeline makes, in order, so a test can see what follows the reserve.
function recordingDb(): { client: SupabaseClient; log: string[]; args: Record<string, unknown>[] } {
  const client = serviceSupabase()
  const log: string[] = []
  const args: Record<string, unknown>[] = []
  const rpc = client.rpc.bind(client)
  const from = client.from.bind(client)
  vi.spyOn(client, 'rpc').mockImplementation(((fn: string, params?: Record<string, unknown>) => {
    log.push(`rpc:${fn}`)
    args.push(params ?? {})
    return rpc(fn, params)
  }) as typeof client.rpc)
  vi.spyOn(client, 'from').mockImplementation(((table: string) => {
    log.push(`from:${table}`)
    args.push({})
    return from(table)
  }) as typeof client.from)
  return { client, log, args }
}

async function setup(behaviour: Behaviour, prices: GenerationProvider['prices'] = PRICES) {
  const userId = await createUser(db, { credits: 3 })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(640, 480), 'image/jpeg')
  const recorded = recordingDb()
  const deps = { db: recorded.client, store: r2.store, provider: provider(behaviour, prices), providerTimeoutMs: 200 }
  const request: GenerationRequest = { userId, source: 'web', templateId, inputKey, copy: { dish: 'ramen' }, aspectRatio: '4:5' }
  return { userId, r2, deps, request, ...recorded }
}

async function costRow(jobId: string) {
  const { rows } = await db.query<{ status: string; provider_usage: unknown; cost_usd: string | null }>(
    'select status, provider_usage, cost_usd from public.generation_jobs where id = $1',
    [jobId],
  )
  const row = rows[0]
  return row ? { ...row, cost_usd: row.cost_usd === null ? null : Number(row.cost_usd) } : null
}

// What the pipeline did after the credits were reserved.
const afterReserve = (log: string[]) => log.slice(log.indexOf('rpc:reserve_credits') + 1)

describe('settlement records usage and cost (T33)', () => {
  it('a success writes usage and cost in the one confirm_job call', async () => {
    const { deps, request, log, args } = await setup('ok')
    const view = await runGeneration(deps, request)
    expect(await costRow(view.id)).toEqual({ status: 'succeeded', provider_usage: USAGE, cost_usd: COST })
    expect(afterReserve(log)).toEqual(['rpc:confirm_job'])
    expect(args[log.indexOf('rpc:confirm_job')]).toMatchObject({ p_provider_usage: USAGE, p_cost_usd: COST })
  })

  it('records usage but no cost when the provider has no price snapshot (no row price, model not in MODEL_PRICES)', async () => {
    const { deps, request } = await setup('ok', null)
    const view = await runGeneration(deps, request)
    expect(await costRow(view.id)).toEqual({ status: 'succeeded', provider_usage: USAGE, cost_usd: null })
  })

  it('records no cost when a needed price is missing', async () => {
    const { deps, request } = await setup('ok', { ...PRICES, outputPerM: null })
    const view = await runGeneration(deps, request)
    expect(await costRow(view.id)).toMatchObject({ provider_usage: USAGE, cost_usd: null })
  })

  it('a failed job the provider billed still records its cost, refunded in one refund_job call', async () => {
    const { userId, deps, request, log } = await setup('billed-error')
    const failure = (await runGeneration(deps, request).catch((e: unknown) => e)) as GenerationFailure
    expect(failure).toBeInstanceOf(GenerationFailure)
    expect(await costRow(failure.jobId)).toEqual({ status: 'failed', provider_usage: USAGE, cost_usd: COST })
    expect(afterReserve(log)).toEqual(['rpc:refund_job'])
    expect((await profileOf(db, userId)).credits).toBe(3)
  })

  it('keeps the usage when the image came back but could not be stored', async () => {
    const { deps, request, r2 } = await setup('ok')
    r2.failPut.next = true
    const failure = (await runGeneration(deps, request).catch((e: unknown) => e)) as GenerationFailure
    expect(await costRow(failure.jobId)).toEqual({ status: 'failed', provider_usage: USAGE, cost_usd: COST })
  })

  it('a timeout has no usage to record', async () => {
    const { deps, request } = await setup('hang')
    const failure = (await runGeneration(deps, request).catch((e: unknown) => e)) as GenerationFailure
    expect(await costRow(failure.jobId)).toEqual({ status: 'failed', provider_usage: null, cost_usd: null })
  })
})

describe('confirm_job with usage', () => {
  it('a repeated confirm keeps the first usage and cost', async () => {
    const userId = await createUser(db, { credits: 2 })
    const service = serviceSupabase()
    const job = await reserveJob(service, { jobId: crypto.randomUUID(), userId, module: 'image', templateId, source: 'web', inputs: {} })
    await confirmJob(service, { jobId: job.id, outputKey: `outputs/${job.id}.png`, usage: USAGE, costUsd: COST })
    await confirmJob(service, { jobId: job.id, outputKey: `outputs/${job.id}.png`, usage: { output_tokens: 1 }, costUsd: 9 })
    expect(await costRow(job.id)).toEqual({ status: 'succeeded', provider_usage: USAGE, cost_usd: COST })
  })

  it('rejects a negative cost and a non-object usage in the database', async () => {
    const userId = await createUser(db, { credits: 2 })
    const service = serviceSupabase()
    const job = await reserveJob(service, { jobId: crypto.randomUUID(), userId, module: 'image', templateId, source: 'web', inputs: {} })
    const negative = await service.rpc('confirm_job', { p_job_id: job.id, p_output_key: 'k', p_cost_usd: -1 })
    expect(negative.error?.message).toMatch(/generation_jobs_cost_usd_nonnegative/)
    const array = await service.rpc('confirm_job', { p_job_id: job.id, p_output_key: 'k', p_provider_usage: [1] })
    expect(array.error?.message).toMatch(/generation_jobs_provider_usage_object/)
  })
})
