import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { applyPurchase } from '@/core/billing'
import { batchArchive, preflightBatch, runGeneration, toGenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'
import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser, profileOf, serviceClient } from './helpers'
import { serviceSupabase } from './supabase-env'

vi.mock('@/core/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/env')>()
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), SUPABASE_SERVICE_ROLE_KEY: 'local-batch-test' }) }
})
let sql: Client
let templates: string[]
beforeAll(async () => {
  sql = await connectAdmin()
  templates = [await seedTemplate(sql), await seedTemplate(sql)]
  await sql.query(`update public.templates set credits_cost='{"1k":2,"2k":3,"3k":4}' where id=$1`, [templates[1]])
})
afterAll(async () => { await sql.end() })

async function setup(productId: 'max_monthly' | 'pro_monthly' | 'starter_monthly') {
  const userId = await createUser(sql)
  await applyPurchase(serviceClient(), { userId, productId, eventId: randomUUID() })
  const db = serviceSupabase()
  const r2 = createMemoryStore()
  const input_key = newInputKey(userId, 'image/jpeg')
  r2.upload(input_key, await jpeg(1024, 768), 'image/jpeg')
  const cells = templates.map(template_id => ({ template_id, input_key, photo_name: '菜品.jpg', inputs: { aspect_ratio: '4:5' as const } }))
  const deps = { db, store: r2.store, provider: fakeProvider().provider, track: vi.fn() }
  return { userId, cells, deps, db }
}

describe('T107 preflight and independent jobs', () => {
  it.each(['starter_monthly', 'pro_monthly'] as const)('rejects %s on both entry points', async product => {
    const { db, userId, cells, deps } = await setup(product)
    await expect(preflightBatch(db, userId, cells)).rejects.toMatchObject({ code: 'TIER_REQUIRED', requiredTier: 'max' })
    const req = toGenerationRequest(userId, { ...cells[0], batch_size: 2, batch_templates: 2 })
    await expect(runGeneration(deps, req)).rejects.toMatchObject({ code: 'TIER_REQUIRED', requiredTier: 'max' })
  })

  it('preflights all paid credits and never falls through to free after an intervening spend', async () => {
    const { db, deps, userId, cells } = await setup('max_monthly')
    const batch = await preflightBatch(db, userId, cells)
    await expect(preflightBatch(db, userId, Array(31).fill(cells[0]))).rejects.toMatchObject({ code: 'TIER_REQUIRED' })
    expect(batch).toMatchObject({ total_credits: 3, batch_templates: 2, batch_size: 2 })
    await sql.query('update public.profiles set credits=2,free_credits=70 where id=$1', [userId])
    await expect(preflightBatch(db, userId, cells)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    const run = (i: number) => runGeneration(deps, toGenerationRequest(userId, { ...cells[i], ...batch, ...batch.cells[i] }))
    const first = await run(0)
    expect(first).toMatchObject({ batch_id: batch.batch_id, credit_pool: 'paid' })
    await expect(run(0)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(run(1)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
    expect(await profileOf(sql, userId)).toMatchObject({ credits: 1, free_credits: 70 })
    const files = await batchArchive(db, userId, batch.batch_id)
    expect(files.files.map(f => f.jobId)).toEqual([first.id])
    await expect(batchArchive(db, randomUUID(), batch.batch_id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deps.track).toHaveBeenCalledWith('generate', expect.objectContaining({ batch_templates: 2 }), expect.anything())
  })

  it('groups distinct jobs and excludes failed and deleted outputs', async () => {
    const { db, deps, userId, cells } = await setup('max_monthly')
    const batch = await preflightBatch(db, userId, cells)
    const request = (i: number) => toGenerationRequest(userId, { ...cells[i], ...batch, ...batch.cells[i] })
    const one = await runGeneration(deps, request(0))
    await expect(runGeneration({ ...deps, provider: fakeProvider('fail').provider }, request(1))).rejects.toThrow()
    expect((await batchArchive(db, userId, batch.batch_id)).files).toHaveLength(1)
    const two = await runGeneration(deps, request(1))
    expect((await batchArchive(db, userId, batch.batch_id)).files.map(f => f.jobId)).toEqual([one.id, two.id])
    await sql.query('update public.generation_jobs set deleted_at=now() where id=$1', [one.id])
    expect((await batchArchive(db, userId, batch.batch_id)).files.map(f => f.jobId)).toEqual([two.id])
  })
})
