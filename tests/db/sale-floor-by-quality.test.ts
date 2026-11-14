import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1295: a route's cost floor (no approved price) samples only the jobs of the template's quality,
// below ten of them the estimate applies, and admin_sale_floor_hidden says why a published
// template is missing from the catalogue.
const provider = randomUUID()
const tag = provider + '/t1295-test'
const prices = { '1k': 120, '2k': 240, '3k': 360 }
let db: Client
let user: string
let medium: string
let high: string

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  user = await createUser(db, { credits: 1000 })
  medium = await createPricedTemplate(db, prices, 'medium')
  high = await createPricedTemplate(db, prices, 'high')
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T1295 fixture','openai_images','t1295-test','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider])
  await db.query(`insert into public.template_prompts(template_id,body,provider_id)
    select unnest($1::text[]),'Fixture',$2`, [[medium, high], provider])
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  // The fixture jobs below skip the insert trigger's own sale check.
  await db.query('set local session_replication_role = replica')
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function jobs(inputs: object, cost: number, n: number) {
  await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,
      visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
    select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',$5,'t1295/x',now()
    from generate_series(1,$6)`, [user, medium, JSON.stringify(inputs), tag, cost, n])
}
const cheap = 0.01
const pricey = 5
const visible = async (id: string) => (await db.query('select 1 from public.web_templates(p_template_id=>$1)', [id])).rowCount === 1
const floor = async (quality: string) =>
  (await db.query("select admin.alternate_route_floor($1,'1k',$2) f", [tag, quality])).rows[0].f
const hidden = async () =>
  (await db.query('select public.admin_sale_floor_hidden() h')).rows[0].h as Array<Record<string, unknown>>

it('four expensive high-quality jobs do not hide medium templates', async () => {
  await jobs({ resolution: '1k', quality: 'medium' }, cheap, 10)
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 4)
  // Mixed, as before 1295, these 14 jobs had a p95 of $5 and hid both templates.
  expect(await visible(medium)).toBe(true)
  expect(await floor('medium')).toMatchObject({ basis: 'p95', samples: 10 })
  // Four high jobs are below the minimum sample: the high template is priced from the estimate.
  expect(await visible(high)).toBe(true)
  expect(await floor('high')).toMatchObject({ basis: 'estimate', samples: 4, usd: 0.01 })
})

it('below the minimum sample uses the estimate; from ten jobs the p95 decides', async () => {
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 9)
  expect(await visible(high)).toBe(true)
  expect(await floor('high')).toMatchObject({ basis: 'estimate', samples: 9 })
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 1)
  expect(await visible(high)).toBe(false)
  expect(await floor('high')).toMatchObject({ basis: 'p95', samples: 10, usd: 5 })
  expect(await visible(medium)).toBe(true)
})

it('jobs without a recorded quality no longer count', async () => {
  await jobs({ resolution: '1k' }, pricey, 20)
  await jobs({}, pricey, 20)
  expect(await visible(medium)).toBe(true)
  expect(await visible(high)).toBe(true)
  expect(await floor('medium')).toMatchObject({ basis: 'estimate', samples: 0 })
})

it('never sells below the floor: the hidden tier is refused before any debit', async () => {
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 10)
  await db.query('set local session_replication_role = origin')
  await db.query('savepoint before_job')
  await expect(db.query(`select public.reserve_credits(gen_random_uuid(),$1,'image',$2,120,'web',
      '{"resolution":"1k"}'::jsonb,$3)`, [user, high, tag])).rejects.toThrow('TEMPLATE_UNAVAILABLE')
  await db.query('rollback to before_job')
  expect((await db.query("select 1 from public.credit_ledger where user_id=$1 and kind='reserve'", [user])).rowCount).toBe(0)
  const ok = await db.query(`select credits_cost from public.reserve_credits(gen_random_uuid(),$1,'image',$2,120,'web',
      '{"resolution":"1k"}'::jsonb,$3)`, [user, medium, tag])
  expect(ok.rows[0].credits_cost).toBe(120)
})

it('says which published templates are hidden and why', async () => {
  const before = await hidden()
  expect(before.map(r => r.template_id)).not.toContain(high)
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 10)
  await db.query('update public.template_sale_approvals set enabled=false where template_id=$1', [medium])
  const after = await hidden()
  expect(after.find(r => r.template_id === high)).toMatchObject({
    quality: 'high', price: 120, route: tag, reason: 'below_floor',
    floor: { basis: 'p95', samples: 10, usd: 5 },
  })
  expect((after.find(r => r.template_id === high)!.floor as { credits: number }).credits).toBeGreaterThan(120)
  expect(after.find(r => r.template_id === medium)).toMatchObject({ reason: 'sale_closed', floor: null })
})

it('serves the report to the server only', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.query('savepoint denied')
    await db.query(`set local role ${role}`)
    await expect(db.query('select public.admin_sale_floor_hidden()')).rejects.toThrow('permission denied')
    await db.query('rollback to denied')
  }
})

it('saves a medium template at its price although pricey high runs share the route', async () => {
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 10)
  await jobs({ resolution: '1k', quality: 'medium' }, cheap, 10)
  await db.query('set local session_replication_role = origin')
  // The Owner's switch of the high templates to medium, prices unchanged.
  await db.query("update public.templates set quality='medium' where id=$1", [high])
  await db.query('set constraints all immediate')
  expect(await visible(high)).toBe(true)
  // Back to high on this route: below the high floor, so the save is refused.
  await db.query('savepoint to_high')
  await expect((async () => {
    await db.query("update public.templates set quality='high' where id=$1", [medium])
    await db.query('set constraints all immediate')
  })()).rejects.toThrow('TEMPLATE_PRICE_BELOW_FLOOR')
  await db.query('rollback to to_high')
})

it("gives the editor's pricing read the p95 per quality", async () => {
  await jobs({ resolution: '1k', quality: 'high' }, pricey, 10)
  await jobs({ resolution: '1k', quality: 'medium' }, cheap, 9)
  await jobs({ resolution: '1k' }, pricey, 10)
  const { rows } = await db.query(`select p->'p95_by_quality' q from jsonb_array_elements(
    public.admin_image_pricing_catalog('gpt-image-test')->'providers') p where p->>'provider_id'=$1`, [provider])
  // Medium has nine of its own: no measured p95 yet. Rows without a quality never count.
  expect(rows[0].q).toEqual({ high: { '1k': 5 } })
})
