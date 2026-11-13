import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1310: jobs with named image slots (inputs.input_slots, several input images per job) never enter
// a route's p95, and a slot template is held to the single-image floor × its number of slots.
// Fixture as in sale-floor-by-quality.test.ts (1295).
const provider = randomUUID()
const tag = provider + '/t1310-test'
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
    values($1,'T1310 fixture','openai_images','t1310-test','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider])
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
    select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',$5,'t1310/x',now()
    from generate_series(1,$6)`, [user, medium, JSON.stringify(inputs), tag, cost, n])
}
const cheap = 0.01
const pricey = 5
const visible = async (id: string) => (await db.query('select 1 from public.web_templates(p_template_id=>$1)', [id])).rowCount === 1
const floor = async (quality: string) =>
  (await db.query("select admin.alternate_route_floor($1,'1k',$2) f", [tag, quality])).rows[0].f
const hidden = async () =>
  (await db.query('select public.admin_sale_floor_hidden() h')).rows[0].h as Array<Record<string, unknown>>

const slotted = async (id: string, slots: number, price: number) => {
  const keys = Array.from({ length: slots }, (_, i) => ({ key: `s${i}`, label: `S${i}`, required: false }))
  await db.query(`update public.templates set fields=jsonb_set(fields,'{images}',$2), credits_cost=jsonb_set(credits_cost,'{1k}',to_jsonb($3::int)) where id=$1`,
    [id, JSON.stringify({ min: 0, max: slots, slots: keys }), price])
}

it('slot jobs stay out of every p95 the floors read', async () => {
  await jobs({ resolution: '1k', quality: 'high' }, cheap, 10)
  const before = await floor('high')
  await jobs({ resolution: '1k', quality: 'high', input_slots: [{ key: 'logo', upload: 'inputs/u/a.png' }] }, pricey, 30)
  expect(await floor('high')).toEqual(before)
  expect(before).toMatchObject({ basis: 'p95', samples: 10 })
  const p95 = (await db.query('select admin.route_p95_by_quality($1) p', [tag])).rows[0].p
  expect(p95.high['1k']).toBeCloseTo(cheap)
  const fallback = (await db.query("select admin.fallback_route_floor($1,'1k','high') f", [tag])).rows[0].f
  await jobs({ resolution: '1k', quality: 'high', input_slots: [] }, pricey, 30)
  expect((await db.query("select admin.fallback_route_floor($1,'1k','high') f", [tag])).rows[0].f).toEqual(fallback)
  expect(await visible(high)).toBe(true)
})

it('a slot template is held to the single-image floor times its slots', async () => {
  const single = (await floor('high')).credits as number
  expect((await db.query('select admin.slot_floor_factor(t) f from public.templates t where id=$1', [high])).rows[0].f).toBe(1)
  await slotted(high, 3, single * 2)
  expect((await db.query('select admin.slot_floor_factor(t) f from public.templates t where id=$1', [high])).rows[0].f).toBe(3)
  expect(await visible(high)).toBe(false)
  const report = (await hidden()).find((row) => row.template_id === high)
  expect(report).toMatchObject({ reason: 'below_floor', floor: { slots: 3, credits: single * 3 } })
  await slotted(high, 3, single * 3)
  expect(await visible(high)).toBe(true)
  // The template without slots next to it is held to the single floor as before.
  expect(await visible(medium)).toBe(true)
})
