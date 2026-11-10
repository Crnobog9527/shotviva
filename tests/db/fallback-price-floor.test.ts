import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'

import { connectAdmin, createUser } from './helpers'

it('uses the higher estimate or p95 from the exact route, quality and tier, excluding unclassified history', async () => {
  const db = await connectAdmin()
  await db.query('begin')
  try {
    const user = await createUser(db)
    const id = randomUUID()
    const tag = id + '/vendor/test'
    await db.query(`insert into public.ai_providers(id, label, model, adapter, resolutions, capabilities, estimated_image_costs)
      values($1, 'test', 'vendor/test', 'openrouter_images', '{1k,2k}', $2, '{"1k":0.01}')`,
    [id, { resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 0, maxReferences: 1,
      fetchedAt: new Date().toISOString(), catalogImageCosts: { '1k': 0.50, '2k': 0.01 } }])
    const budget = Number((await db.query('select admin.lowest_credit_price()*0.761*0.4 as budget')).rows[0].budget)
    const floor = async (tier = '1k', quality = 'high') =>
      Number((await db.query('select admin.fallback_route_floor($1,$2,$3) as floor', [tag,tier,quality])).rows[0].floor)
    const samples = (quality: string | null, cost: number, n: number) => db.query(`
      insert into public.generation_jobs(id,user_id,module,template_id,inputs,provider,source,status,visibility,credits_cost,credit_pool,cost_usd,finished_at,output_key)
      select gen_random_uuid(),$1,'image','freeform',jsonb_strip_nulls(jsonb_build_object('resolution','1k','quality',$2::text)),
        $3,'web','succeeded','public',1,'free',$4,now(),'test.png' from generate_series(1,$5)`, [user,quality,tag,cost,n])
    await samples(null, 8, 10)
    await samples('medium', 4, 10)
    await samples('high', 1, 9)
    expect(await floor()).toBe(Math.ceil(0.5 * 1.1 / budget))
    await samples('high', 1, 1)
    expect(await floor()).toBe(Math.ceil(1.1 / budget))
    expect(await floor('1k', 'medium')).toBe(Math.ceil(4.4 / budget))
    expect(await floor('2k')).toBe(Math.ceil(0.011 / budget))
  } finally {
    await db.query('rollback')
    await db.end()
  }
})
