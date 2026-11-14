import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1551–1552: the official OpenAI line and a BYOK OpenRouter line on the same OpenAI model are one
// cost pool. Measured costs and approved prices of one count for the other; the BYOK line is priced
// from OpenAI's list estimate, not its catalogue estimate with the top-up factor.
const model = 'gpt-image-2.6-sunburst'
const official = randomUUID()
const routed = randomUUID()
const officialTag = official + '/' + model
const routedTag = routed + '/openai/' + model
const caps = (extra: object) => JSON.stringify({ resolutions: ['1k', '2k', '4k'], aspectRatios: ['1:1'], originalRatio: true,
  minReferences: 0, maxReferences: 16, fetchedAt: '2026-11-15T00:00:00Z', ...extra })
let db: Client
let user: string
let template: string

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock(hashtextextended('shotviva.template_catalog',0))")
  user = await createUser(db, { credits: 1000 })
  template = await createPricedTemplate(db, { '1k': 120, '2k': 240, '3k': 360 })
  await db.query(`insert into public.ai_providers(id,label,adapter,model,base_url,resolutions)
    values($1,'Official','openai_images',$2,'https://api.openai.com/v1','{1k,2k,4k}')`, [official, model])
  await db.query(`insert into public.ai_providers(id,label,adapter,model,base_url,resolutions,capabilities)
    values($1,'Routed','openrouter_images',$2,'https://openrouter.ai/api/v1','{1k,2k,4k}',$3)`,
  [routed, 'openai/' + model, caps({ catalogImageCosts: { '1k': 0.5, '2k': 0.9, '4k': 1.3 } })])
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await db.query('set local session_replication_role = replica')
})
afterEach(async () => { await db.query('rollback'); await db.end() })

const byok = (on: boolean) => db.query('update public.ai_providers set byok_list_price=$2 where id=$1', [routed, on])
const floor = async (tag: string, quality = 'medium', tier = '1k') =>
  (await db.query('select admin.alternate_route_floor($1,$2,$3) f', [tag, tier, quality])).rows[0].f
async function jobs(tag: string, cost: number, n: number, quality = 'medium') {
  await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,
      visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
    select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',$5,'t1552/x',now()
    from generate_series(1,$6)`, [user, template, JSON.stringify({ resolution: '1k', quality }), tag, cost, n])
}

it('pools the official and BYOK lines of one model, and only those', async () => {
  const tags = async (tag: string) => (await db.query('select admin.route_cost_tags($1) t', [tag])).rows[0].t as string[]
  expect(await tags(routedTag)).toEqual(expect.arrayContaining([officialTag, routedTag, 'env/' + model]))
  expect(await tags(officialTag)).toEqual(expect.arrayContaining([officialTag, routedTag]))
  await byok(false)
  expect(await tags(routedTag)).toEqual([routedTag])
  expect(await tags(officialTag)).not.toContain(routedTag)
})

it('prices a BYOK line from the list estimate by quality, a non-BYOK one from its catalogue', async () => {
  expect(await floor(routedTag)).toMatchObject({ basis: 'list' })
  expect(await floor(routedTag, 'high', '4k')).toEqual(await floor(officialTag, 'high', '4k'))
  expect((await floor(routedTag, 'high')).usd).toBeGreaterThan((await floor(routedTag)).usd)
  expect(await floor(routedTag)).toEqual({ ...(await floor(officialTag)), samples: 0 })
  await byok(false)
  expect(await floor(routedTag)).toMatchObject({ basis: 'catalog', usd: 0.5 })
  expect((await db.query("select admin.fallback_route_floor($1,'1k','medium')::int n", [routedTag])).rows[0].n)
    .toBeGreaterThan((await db.query("select admin.fallback_route_floor($1,'1k','medium')::int n", [officialTag])).rows[0].n)
})

it("samples the pool's jobs at the template's quality", async () => {
  await jobs(officialTag, 0.02, 6)
  await jobs(routedTag, 0.02, 3)
  await jobs(routedTag, 0.02, 5, 'high')
  expect(await floor(routedTag)).toMatchObject({ basis: 'list', samples: 9 })
  await jobs(officialTag, 0.02, 1)
  expect(await floor(routedTag)).toMatchObject({ basis: 'p95', samples: 10, usd: 0.02 })
  expect(await floor(officialTag)).toMatchObject({ basis: 'p95', samples: 10 })
  const p95 = (await db.query('select admin.route_p95_by_quality($1) q', [routedTag])).rows[0].q
  expect(p95.medium['1k']).toBeCloseTo(0.02, 6)
  const pricing = (await db.query("select p95 from public.admin_image_provider_pricing('x') where provider_id=$1", [routed])).rows[0]
  expect(pricing.p95['1k']).toBeCloseTo(0.02, 6)
  await byok(false)
  expect(await floor(routedTag)).toMatchObject({ basis: 'catalog', samples: 3 })
})

it('lets a BYOK line sell at the official line\'s approved price and keeps that line from deletion', async () => {
  const batch = (await db.query('insert into admin.template_price_batches default values returning id')).rows[0].id
  await db.query(`insert into admin.template_price_snapshots(batch_id,template_id,previous,applied,provider_id,provider_endpoint_hash)
    values($1,'edit','{}','{}',$2,md5('https://api.openai.com/v1'))`, [batch, official])
  const approved = async () => (await db.query('select admin.template_approved_price($1,$2) a, admin.template_approved_prices($1)->$2 m',
    [routed, 'edit'])).rows[0]
  const tariff = { quality: 'medium', costs: { '1k': 20, '2k': 37, '4k': 58 } }
  expect(await approved()).toEqual({ a: tariff, m: tariff })
  const catalog = (await db.query("select public.admin_image_pricing_catalog('x')->'providers' p")).rows[0].p as Array<Record<string, unknown>>
  expect(catalog.find(p => p.provider_id === routed)).toMatchObject({ list_priced: true, approved: { edit: tariff } })
  await db.query("update public.templates set quality='medium', credits_cost='{\"1k\":20,\"2k\":37,\"4k\":58}' where id='edit'")
  const sells = async () => (await db.query(
    "select admin.reservation_route_allowed(t,$1,'1k',20,false,true) ok from public.templates t where id='edit'", [routedTag])).rows[0].ok
  expect(await sells()).toBe(true)
  await byok(false)
  expect(await approved()).toEqual({ a: null, m: null })
  expect(await sells()).toBe(false)
  await db.query('savepoint del')
  await expect(db.query('select public.admin_delete_provider($1)', [official])).rejects.toThrow('PROVIDER_REFERENCED')
  await db.query('rollback to del')
})

it('saves the setting for admins only', async () => {
  await db.query('reset session_replication_role')
  await db.query("update public.profiles set role='admin' where id=$1", [user])
  await db.query('select public.admin_set_provider_byok_list_price($1,$2,false)', [user, routed])
  expect((await db.query('select byok_list_price b from public.ai_providers where id=$1', [routed])).rows[0].b).toBe(false)
  await db.query('savepoint nope')
  await expect(db.query('select public.admin_set_provider_byok_list_price($1,$2,true)', [randomUUID(), routed])).rejects.toThrow('NOT_ADMIN')
  await db.query('rollback to nope')
})
