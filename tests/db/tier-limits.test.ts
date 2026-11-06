import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ServerTrack } from '@/core/analytics'
import { applyPurchase, TIER_LIMITS } from '@/core/billing'
import type { ProductId } from '@/core/config'
import { runGeneration, type GenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'

import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

// T28: TIER_LIMITS on the real generation path (ARCHITECTURE §6.2). perWindow is Starter 20 /
// Pro 40 / Max 80 per 10 minutes, so a Max batch of 30 is not cut at 20; a batch bigger than
// the tier's batchMax is TIER_REQUIRED before any credit moves.

let db: Client
let templateId: string

beforeAll(async () => {
  db = await connectAdmin()
  templateId = await seedTemplate(db)
})

afterAll(async () => {
  await db.end()
})

async function member(productId: ProductId | null) {
  const userId = await createUser(db, { credits: 5 })
  if (productId) await applyPurchase(serviceClient(), { userId, productId, eventId: `cs_${randomUUID()}` })
  const r2 = createMemoryStore()
  const inputKey = newInputKey(userId, 'image/jpeg')
  r2.upload(inputKey, await jpeg(1024, 768), 'image/jpeg')
  const deps = { db: serviceSupabase(), store: r2.store, provider: fakeProvider().provider, providerTimeoutMs: 200 }
  const request = (overrides: Partial<GenerationRequest> = {}): GenerationRequest => ({
    userId,
    source: 'web',
    templateId,
    inputKey,
    aspectRatio: '4:5',
    ...overrides,
  })
  return { userId, deps, request }
}

// Jobs that started (and already failed) inside the window: they count against perWindow only.
async function startedInWindow(userId: string, count: number) {
  await db.query(
    `insert into public.generation_jobs (id, user_id, module, template_id, source, credit_pool, visibility, credits_cost, status, finished_at)
     select gen_random_uuid(), $1, 'image', $2, 'web', 'free', 'public', 1, 'failed', now() from generate_series(1, $3)`,
    [userId, templateId, count],
  )
}

describe('perWindow follows the tier', () => {
  it.each([
    [null, TIER_LIMITS.starter.perWindow],
    ['starter_monthly', 20],
    ['pro_monthly', 40],
    ['max_yearly', 80],
  ] as const)('after %s: the %i-th start in 10 minutes is refused, the one before it goes through', async (productId, perWindow) => {
    const { userId, deps, request } = await member(productId)
    await startedInWindow(userId, perWindow - 1)
    await expect(runGeneration(deps, request())).resolves.toMatchObject({ status: 'succeeded' })
    await expect(runGeneration(deps, request())).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
  })

  it('lets Max start a 30-photo batch where Starter would stop at 20', async () => {
    const { userId, deps, request } = await member('max_monthly')
    await startedInWindow(userId, 29)
    await expect(runGeneration(deps, request({ batchSize: 30 }))).resolves.toMatchObject({ status: 'succeeded' })
  })
})

describe('batchMax follows the tier', () => {
  it.each([
    [null, 2, 'pro'],
    ['starter_yearly', 2, 'pro'],
    ['pro_monthly', 11, 'max'],
  ] as const)('after %s: a batch of %i is TIER_REQUIRED naming %s, nothing charged', async (productId, batchSize, tier) => {
    const { userId, deps, request } = await member(productId)
    const before = (await profileOf(db, userId)).credits
    const refused = runGeneration(deps, request({ batchSize }))
    await expect(refused).rejects.toMatchObject({ code: 'TIER_REQUIRED', status: 403, requiredTier: tier })
    await expect(refused.catch((error: { toBody(): unknown }) => error.toBody())).resolves.toMatchObject({ required_tier: tier })
    expect((await profileOf(db, userId)).credits).toBe(before)
  })

  it.each([
    ['pro_monthly', 10],
    ['max_monthly', 30],
  ] as const)('after %s: a batch of %i goes through and `generate` carries batch_size', async (productId, batchSize) => {
    const { deps, request } = await member(productId)
    const track = vi.fn<ServerTrack>()
    await expect(runGeneration({ ...deps, track }, request({ batchSize }))).resolves.toMatchObject({ status: 'succeeded' })
    expect(track).toHaveBeenCalledWith('generate', expect.objectContaining({ batch_size: batchSize }), expect.anything())
  })

  it('a single photo is batch_size 1 for every tier', async () => {
    const { deps, request } = await member(null)
    const track = vi.fn<ServerTrack>()
    await runGeneration({ ...deps, track }, request())
    expect(track).toHaveBeenCalledWith('generate', expect.objectContaining({ batch_size: 1 }), expect.anything())
  })
})
