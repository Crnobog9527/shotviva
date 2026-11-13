import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser, ledgerOf } from './helpers'

// Migration 1431 (PR-2): the stored top tier is 4k. The code deployed before it still sends 3k
// through its fetch shim, so every write path and every function that takes a tier must read 3k
// as 4k, and history (generation_jobs.inputs) that says 3k is the same tier. Raw SQL here, no shim.

let db: Client
let template: string

beforeAll(async () => {
  db = await connectAdmin()
  template = await createPricedTemplate(db, { '1k': 1, '2k': 2, '4k': 3 }, 'medium')
})

afterAll(async () => {
  await db.query("delete from public.ai_providers where label like 'PR2 4k %'")
  await db.end()
})

const reserveRaw = async (userId: string, resolution: string) => {
  const job = randomUUID()
  await db.query("select public.reserve_credits($1, $2, 'image', $3, null, 'web', $4::jsonb)", [job, userId, template, JSON.stringify({ resolution })])
  return (await db.query("select inputs->>'resolution' as r, credits_cost from public.generation_jobs where id = $1", [job])).rows[0] as { r: string; credits_cost: number }
}

describe('reserve_credits takes both names for the top tier', () => {
  it('charges the 4k price for 3k and 4k alike and records 4k', async () => {
    const userId = await createUser(db, { credits: 20 })
    expect(await reserveRaw(userId, '3k')).toEqual({ r: '4k', credits_cost: 3 })
    expect(await reserveRaw(userId, '4k')).toEqual({ r: '4k', credits_cost: 3 })
    expect((await ledgerOf(db, userId)).map((row) => row.delta)).toEqual([-3, -3])
  })

  it('still refuses an unknown tier', async () => {
    const userId = await createUser(db, { credits: 20 })
    await expect(reserveRaw(userId, '8k')).rejects.toThrow(/INVALID_INPUT/)
  })
})

describe('writes in the old name are stored in the new one', () => {
  it('stores a 3k-keyed credits_cost as 4k', async () => {
    const id = await createPricedTemplate(db, { '1k': 1, '2k': 2, '3k': 7 }, 'medium')
    expect((await db.query('select credits_cost from public.templates where id = $1', [id])).rows[0].credits_cost).toEqual({ '1k': 1, '2k': 2, '4k': 7 })
    await db.query(`update public.templates set credits_cost = '{"1k": 1, "2k": 2, "3k": 8}' where id = $1`, [id])
    expect((await db.query('select credits_cost from public.templates where id = $1', [id])).rows[0].credits_cost).toEqual({ '1k': 1, '2k': 2, '4k': 8 })
  })

  it('stores a provider\'s 3k tiers, limit and estimates as 4k', async () => {
    const caps = { resolutions: ['1k', '3k'], resolutionLimit: ['1k', '3k'], catalogImageCosts: { '3k': 0.2 }, aspectRatios: ['1:1'], originalRatio: true,
      minReferences: 0, maxReferences: 4, fetchedAt: new Date().toISOString() }
    const row = (await db.query(`insert into public.ai_providers (module, adapter, label, base_url, model, capabilities, resolutions, estimated_image_costs)
      values ('image', 'openai_images', 'PR2 4k ' || $1, 'https://api.openai.com/v1', 'gpt-image-2.6', $2, '{1k,3k}', '{"3k": 0.3}') returning resolutions, capabilities, estimated_image_costs`,
    [randomUUID().slice(0, 6), JSON.stringify(caps)])).rows[0]
    expect(row.resolutions).toEqual(['1k', '4k'])
    expect(row.capabilities).toMatchObject({ resolutions: ['1k', '4k'], resolutionLimit: ['1k', '4k'], catalogImageCosts: { '4k': 0.2 } })
    expect(row.estimated_image_costs).toEqual({ '4k': 0.3 })
  })

  it('stores 3k in unpriced tiers as 4k', async () => {
    const id = await createPricedTemplate(db, { '1k': 1, '2k': 2, '4k': 3 }, 'medium')
    await db.query("select admin.set_template_unpriced_resolutions($1, '{3k}')", [id])
    expect((await db.query('select unpriced_resolutions from public.template_sale_approvals where template_id = $1', [id])).rows[0].unpriced_resolutions).toEqual(['4k'])
  })
})

describe('floor functions read 3k as 4k', () => {
  it('gives the same fallback and alternate floors for 3k and 4k', async () => {
    for (const quality of ['medium', 'high']) {
      const fallback = (await db.query(
        "select admin.fallback_route_floor('env/gpt-image-2.6', '3k', $1) as old, admin.fallback_route_floor('env/gpt-image-2.6', '4k', $1) as new", [quality])).rows[0]
      expect(fallback.new).not.toBeNull()
      expect(fallback.old).toEqual(fallback.new)
    }
  })

  it('counts 3k history and 4k jobs as one tier in the route p95', async () => {
    const userId = await createUser(db)
    const tag = `pr2-route/${randomUUID().slice(0, 6)}`
    await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
      select gen_random_uuid(),$1,'image',$2,jsonb_build_object('resolution', case when n % 2 = 0 then '3k' else '4k' end, 'quality', 'medium'),$3,'web','succeeded','private',1,'paid',0.1,'pr2/x',now()
      from generate_series(1,10) n`, [userId, template, tag])
    const p95 = (await db.query('select admin.route_p95_by_quality($1) as v', [tag])).rows[0].v
    expect(Object.keys(p95.medium)).toEqual(['4k'])
  })
})

describe('the stored data and checks name 4k only', () => {
  it('leaves no 3k in templates, providers or sale approvals', async () => {
    const left = (await db.query(`select
      (select count(*) from public.templates where credits_cost ? '3k')::int as t,
      (select count(*) from public.ai_providers where '3k' = any(resolutions) or estimated_image_costs ? '3k')::int as p,
      (select count(*) from public.template_sale_approvals where '3k' = any(unpriced_resolutions))::int as s`)).rows[0]
    expect(left).toEqual({ t: 0, p: 0, s: 0 })
  })
})
