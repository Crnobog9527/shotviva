import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { applyPurchase } from '@/core/billing'
import { batchArchive, preflightBatch, reserveJob, runGeneration, toGenerationRequest } from '@/core/jobs'
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

async function setup(productId: 'max_monthly' | 'pro_monthly' | 'starter_monthly', role?: 'admin' | 'banned_admin') {
  const userId = await createUser(sql)
  await applyPurchase(serviceClient(), { userId, productId, eventId: randomUUID() })
  if (role) await sql.query(`update public.profiles set role='admin', banned_at=$2 where id=$1`, [userId, role === 'banned_admin' ? new Date() : null])
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
    await expect(preflightBatch(db, userId, cells, deps.provider)).rejects.toMatchObject({ code: 'TIER_REQUIRED', requiredTier: 'max' })
    const req = toGenerationRequest(userId, { ...cells[0], batch_size: 2, batch_templates: 2 })
    await expect(runGeneration(deps, req)).rejects.toMatchObject({ code: 'TIER_REQUIRED', requiredTier: 'max' })
  })

  // effective_tier(): an unbanned admin gets Max limits on any plan and still pays credits.
  it('runs a multi-template batch for an admin on Starter, charging paid credits', async () => {
    const { db, deps, userId, cells } = await setup('starter_monthly', 'admin')
    const before = await profileOf(sql, userId)
    const quote = await preflightBatch(db, userId, cells, deps.provider)
    const jobs = await Promise.all(cells.map((cell, index) => runGeneration(deps,
      toGenerationRequest(userId, { ...cell, ...quote, ...quote.cells[index] }))))
    expect(jobs.map(job => [job.status, job.credit_pool])).toEqual([['succeeded', 'paid'], ['succeeded', 'paid']])
    expect((await profileOf(sql, userId)).credits).toBe(before.credits - jobs.reduce((sum, job) => sum + job.credits_cost, 0))
  })

  it('gives a banned admin on Pro no multi-template batch', async () => {
    const { db, userId, cells, deps } = await setup('pro_monthly', 'banned_admin')
    await expect(preflightBatch(db, userId, cells, deps.provider)).rejects.toMatchObject({ code: 'TIER_REQUIRED', requiredTier: 'max' })
  })

  // The SQL gate on its own, past the TS check: reserve_batch_cell reads effective_tier().
  it.each([
    ['pro_monthly', undefined, { code: 'TIER_REQUIRED', requiredTier: 'max' }],
    // A banned account is refused before any tier check, admin or not.
    ['pro_monthly', 'banned_admin', { code: 'FORBIDDEN', message: 'USER_BANNED' }],
    ['starter_monthly', 'admin', null],
  ] as const)('reserve_batch_cell for a multi-template cell: %s %s', async (product, role, refused) => {
    const { db, userId } = await setup(product, role)
    const before = await profileOf(sql, userId)
    const cost = (await sql.query(`select (credits_cost->>'1k')::int as cost from public.templates where id=$1`, [templates[0]])).rows[0].cost
    const reserve = reserveJob(db, { jobId: randomUUID(), userId, module: 'image', templateId: templates[0], expectedCredits: cost, source: 'web',
      inputs: { resolution: '1k', attempt_id: randomUUID(), batch_id: randomUUID(), batch_position: 1, batch_size: 2, batch_templates: 2 } })
    if (refused) {
      await expect(reserve).rejects.toMatchObject(refused)
      expect((await profileOf(sql, userId)).credits).toBe(before.credits)
    } else {
      expect(await reserve).toMatchObject({ creditPool: 'paid', creditsCost: cost })
      expect((await profileOf(sql, userId)).credits).toBe(before.credits - cost)
    }
  })

  it('rejects an unsold resolution for any selected template during preflight', async () => {
    const { db, userId, cells, deps } = await setup('max_monthly')
    const id = await seedTemplate(sql)
    await sql.query("select admin.set_template_unpriced_resolutions($1,'{3k}')", [id])
    const chosen = cells.map((cell, i) => ({ ...cell, template_id: i ? id : cell.template_id,
      inputs: { ...cell.inputs, resolution: '3k' as const } }))
    await expect(preflightBatch(db, userId, chosen, deps.provider)).rejects.toMatchObject({ code: 'TEMPLATE_UNAVAILABLE', templateId: id })
  })

  it.each(['closed', 'underpriced'] as const)('rejects an entire batch with a %s template before debit', async reason => {
    const { db, deps, userId, cells } = await setup('max_monthly')
    // The fixture price is below the actual fallback floor. Give the first cell a sellable
    // price so the second cell, and its template identifier, are what this test exercises.
    const valid = await seedTemplate(sql)
    const invalid = await seedTemplate(sql)
    await sql.query(`update public.templates set credits_cost='{"1k":500,"2k":500,"3k":500}' where id=$1`, [valid])
    if (reason === 'closed') {
      await sql.query(`update public.templates set credits_cost='{"1k":500,"2k":500,"3k":500}' where id=$1`, [invalid])
      await sql.query('update public.template_sale_approvals set enabled=false where template_id=$1', [invalid])
    }
    const version = await sql.query("select value from public.system_settings where key='pricing_catalog_version'")
    const before = await profileOf(sql, userId)
    try {
      await sql.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
        on conflict(key) do update set value=excluded.value`)
      const grid = cells.map((cell, i) => ({ ...cell, template_id: i ? invalid : valid }))
      await expect(preflightBatch(db, userId, grid, { ...deps.provider, id: 'env/qa-t107' }))
        .rejects.toMatchObject({ code: 'TEMPLATE_UNAVAILABLE', templateId: invalid })
      expect((await profileOf(sql, userId)).credits).toBe(before.credits)
      expect((await sql.query('select id from public.generation_jobs where user_id=$1', [userId])).rowCount).toBe(0)
    } finally {
      if (version.rows.length) await sql.query("update public.system_settings set value=$1 where key='pricing_catalog_version'",
        [JSON.stringify(version.rows[0].value)])
      else await sql.query("delete from public.system_settings where key='pricing_catalog_version'")
    }
  })

  it('submits every quoted cell of a sellable multi-template batch', async () => {
    const { db, deps, userId, cells } = await setup('max_monthly')
    const quote = await preflightBatch(db, userId, cells, deps.provider)
    const jobs = await Promise.all(cells.map((cell, index) => runGeneration(deps,
      toGenerationRequest(userId, { ...cell, ...quote, ...quote.cells[index] }))))
    expect(jobs.map(job => job.status)).toEqual(['succeeded', 'succeeded'])
    expect((await batchArchive(db, userId, quote.batch_id)).files.map(file => file.jobId)).toEqual(jobs.map(job => job.id))
  })

  it('preflights all paid credits and never falls through to free after an intervening spend', async () => {
    const { db, deps, userId, cells } = await setup('max_monthly')
    const batch = await preflightBatch(db, userId, cells, deps.provider)
    await expect(preflightBatch(db, userId, Array(31).fill(cells[0]), deps.provider)).rejects.toMatchObject({ code: 'TIER_REQUIRED' })
    expect(batch).toMatchObject({ total_credits: 3, batch_templates: 2, batch_size: 2 })
    await sql.query('update public.profiles set credits=2,free_credits=70 where id=$1', [userId])
    await expect(preflightBatch(db, userId, cells, deps.provider)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
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
    const batch = await preflightBatch(db, userId, cells, deps.provider)
    const request = (i: number) => toGenerationRequest(userId, { ...cells[i], ...batch, ...batch.cells[i] })
    const attempts = await Promise.allSettled([runGeneration(deps, request(0)), runGeneration(deps, request(0))])
    const success = attempts.find(result => result.status === 'fulfilled')
    expect(attempts.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { code: 'CONFLICT' } }])
    if (!success) throw new Error('One concurrent attempt should succeed')
    const one = success.value
    await expect(runGeneration({ ...deps, provider: fakeProvider('fail').provider }, request(1))).rejects.toThrow()
    expect((await batchArchive(db, userId, batch.batch_id)).files).toHaveLength(1)
    const two = await runGeneration(deps, request(1))
    expect((await batchArchive(db, userId, batch.batch_id)).files.map(f => f.jobId)).toEqual([one.id, two.id])
    await sql.query('update public.generation_jobs set deleted_at=now() where id=$1', [one.id])
    expect((await batchArchive(db, userId, batch.batch_id)).files.map(f => f.jobId)).toEqual([two.id])
  })
})
