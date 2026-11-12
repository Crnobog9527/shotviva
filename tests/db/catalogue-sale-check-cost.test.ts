import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1250–1253: the catalogue reads run the sale check once per requested template, and a route's
// floor samples that route's own jobs. The decisions themselves are covered by
// web-template-sale.test.ts and the price-floor tests; these pin the cost and the sampling.
const provider = randomUUID()
const other = randomUUID()
const tag = provider + '/t1250-test'
let db: Client
let user: string
let ids: string[]

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  user = await createUser(db, { credits: 1000 })
  ids = []
  for (let i = 0; i < 4; i++) ids.push(await createPricedTemplate(db, { '1k': 120, '2k': 240, '3k': 360 }))
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T1250 fixture','openai_images','t1250-test','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}'),
          ($2,'T1250 other','openai_images','t1250-other','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider, other])
  await db.query(`insert into public.template_prompts(template_id,body,provider_id)
    select unnest($1::text[]),'Fixture',$2`, [ids, provider])
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function saleChecks(sql: string, params: unknown[] = []) {
  const calls = async () => Number((await db.query(`select coalesce(sum(calls),0) n from pg_stat_xact_user_functions
    where schemaname='admin' and funcname='web_standard_sale_allowed'`)).rows[0].n)
  await db.query("set local track_functions='all'")
  const before = await calls()
  await db.query('set local role anon')
  const rows = (await db.query(sql, params)).rows
  await db.query('reset role')
  return { rows, checks: (await calls()) - before }
}

it('checks only the requested template on a one-template lookup, as anon', async () => {
  const { rows, checks } = await saleChecks('select id from public.web_templates(p_template_id=>$1)', [ids[0]])
  expect(rows).toEqual([{ id: ids[0] }])
  expect(checks).toBe(1)
})

it('checks each published template once for the catalogue entries', async () => {
  const published = Number((await db.query('select count(*) n from admin.published_web_members')).rows[0].n)
  const { rows, checks } = await saleChecks('select entry_key from public.web_catalogue_entries')
  expect(rows.map(r => r.entry_key)).toEqual(expect.arrayContaining(ids.map(id => 'template-' + id)))
  expect(checks).toBe(published)
})

it('returns whole template rows, so a column added later still comes back', async () => {
  await db.query('set constraints all immediate') // run the deferred publish checks before the alter
  await db.query('alter table public.templates add column t1250_probe integer default 7')
  await db.query('set local role anon')
  const { rows } = await db.query('select id, t1250_probe from public.web_templates(p_template_id=>$1)', [ids[0]])
  expect(rows).toEqual([{ id: ids[0], t1250_probe: 7 }])
})

async function jobs(route: string, inputs: object, cost: number, n = 10) {
  await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,
      visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
    select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',$5,'t1250/x',now()
    from generate_series(1,$6)`, [user, ids[0], JSON.stringify(inputs), route, cost, n])
}
const meetsFloor = async () => (await db.query(
  "select admin.alternate_route_meets_floor($1,'1k','medium',120) ok", [tag])).rows[0].ok

it("prices a route from its own jobs' p95, legacy rows without a resolution counting as 1k", async () => {
  await db.query('set local session_replication_role = replica')
  expect(await meetsFloor()).toBe(true)
  await jobs(other + '/t1250-other', { resolution: '1k', quality: 'medium' }, 5)
  expect(await meetsFloor()).toBe(true)
  await jobs(tag, { resolution: '1k', quality: 'medium' }, 5, 9)
  expect(await meetsFloor()).toBe(true) // nine samples: below the ten the p95 needs
  await jobs(tag, {}, 5, 1)
  expect(await meetsFloor()).toBe(false)
})

it('reads one approved price exactly as the whole-batch map has it', async () => {
  const { rows } = await db.query(`select count(*) filter (where admin.template_approved_price(p.id,t.id)
      is distinct from admin.template_approved_prices(p.id)->t.id) mismatches, count(*) total
    from public.templates t cross join public.ai_providers p`)
  expect(Number(rows[0].total)).toBeGreaterThan(0)
  expect(Number(rows[0].mismatches)).toBe(0)
})
