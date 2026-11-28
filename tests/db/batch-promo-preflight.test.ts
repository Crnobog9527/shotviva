import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { preflightBatch, runGeneration, toGenerationRequest } from '@/core/jobs'
import { newInputKey } from '@/core/storage'
import { jpeg } from '../fakes/images'
import { createMemoryStore } from '../fakes/memory-store'
import { row } from './affiliate-fixtures'
import { fakeProvider, seedTemplate } from './generation-fixtures'
import { connectAdmin, createUser } from './helpers'
import { adminActor, months, partner } from './partner-promo-fixtures'
import { serviceSupabase } from './supabase-env'

vi.mock('@/core/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@/core/env')>()
  return { ...actual, serverEnv: () => ({ ...actual.serverEnv(), SUPABASE_SERVICE_ROLE_KEY: 'local-batch-test' }) }
})

// An affiliate org member's 1K batch (Owner 2026-11-28, migration 2036) end to end: the preflight
// reads the same rule as reserve_batch_cell (readBatchPromoAllowed) and checks the 1K cells
// against the org's promotion share; a 1K cell that fails gives its credits back to that share.
let sql: Client
let template: string
const PRICE_1K = 10
beforeAll(async () => {
  sql = await connectAdmin()
  template = await seedTemplate(sql, { credits: { '1k': PRICE_1K, '2k': 20, '3k': 30 } })
})
afterAll(async () => { await sql.end() })

// An affiliate org with its workspace on and batch limits lifted, and one member holding `paid`
// and `promo` org credits; two uploaded photos.
async function member(paid: number, promo: number) {
  const actor = await adminActor(sql)
  const m = await months(sql)
  const { orgId, owner } = await partner(sql, actor)
  await sql.query('update public.orgs set batch_max=10, multi_template_max=2 where id=$1', [orgId])
  await sql.query('select admin_partner_promo_topup($1,$2)', [actor, { org_id: orgId, recipient: owner, period: m.current, credits: 5000, reason: 't', request_key: randomUUID() }])
  await sql.query('select admin_org_grant($1,$2)', [actor, { org_id: orgId, kind: 'bank_grant', credits: 5000, request_id: 'bank:' + randomUUID() }])
  const userId = await createUser(sql)
  await sql.query('select org_join($1,(select invite_token from orgs where id=$2))', [userId, orgId])
  if (paid) await sql.query('select org_allocate($1,$2,$3,$4)', [owner, userId, paid, randomUUID()])
  if (promo) await sql.query('select org_allocate_promo($1,$2,$3,$4)', [owner, userId, promo, randomUUID()])
  const r2 = createMemoryStore()
  const keys = [newInputKey(userId, 'image/jpeg'), newInputKey(userId, 'image/jpeg')]
  for (const key of keys) r2.upload(key, await jpeg(1024, 768), 'image/jpeg')
  const cells = keys.map((input_key, i) => ({ template_id: template, input_key, photo_name: `菜品${i}.jpg`, inputs: { aspect_ratio: '4:5' as const, resolution: '1k' as const } }))
  return { orgId, userId, cells, r2, db: serviceSupabase() }
}
const seat = (orgId: string, userId: string) => row(sql, 'select held_credits, held_promo_credits from org_members where org_id=$1 and user_id=$2', [orgId, userId])

describe('an affiliate member\'s 1K batch', () => {
  it('passes the preflight on the promotion share, and is refused once that share is short', async () => {
    const enough = await member(0, 20)
    const quote = await preflightBatch(enough.db, enough.userId, enough.cells, fakeProvider().provider)
    expect(quote).toMatchObject({ total_credits: 2 * PRICE_1K, batch_size: 2 })
    // Only promotion credits are short (19 of 20); 100 paid credits never stand in for them.
    const short = await member(100, 19)
    await expect(preflightBatch(short.db, short.userId, short.cells, fakeProvider().provider)).rejects.toMatchObject({ code: 'CREDITS_INSUFFICIENT' })
  })

  it('gives a failed 1K cell\'s credits back to the org\'s promotion share', async () => {
    const { orgId, userId, cells, r2, db } = await member(0, 30)
    const quote = await preflightBatch(db, userId, cells, fakeProvider().provider)
    const request = toGenerationRequest(userId, { ...cells[0]!, ...quote, ...quote.cells[0]! })
    const deps = { db, store: r2.store, provider: fakeProvider('fail').provider, track: vi.fn() }
    await expect(runGeneration(deps, request)).rejects.toThrow()
    const job = await row(sql, 'select status, credit_pool, credits_cost from generation_jobs where user_id=$1', [userId])
    expect(job).toMatchObject({ status: 'failed', credit_pool: 'free', credits_cost: PRICE_1K })
    expect(await seat(orgId, userId)).toMatchObject({ held_credits: 0, held_promo_credits: 30 })
    expect(await row(sql, 'select free_credits from profiles where id=$1', [userId])).toMatchObject({ free_credits: 30 })
  })
})
