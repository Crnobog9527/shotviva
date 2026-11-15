import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1570: the budget lives in admin.template_floor_budget_cache, refreshed by statement triggers on
// every input; route floors are kept once per statement. Results must equal the uncached
// calculations at every step. Synthetic policy and fixtures only.
let db: Client
const provider = randomUUID()
const tag = `${provider}/t1570-test`

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await seedCatalogPolicy(db)
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T1570 fixture','openai_images','t1570-test','{1k,2k,4k}','{"1k":0.01,"2k":0.02,"4k":0.03}')`, [provider])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

const row = async () => (await db.query('select breakeven, floor_budget, margin_target_bp from admin.template_floor_budget_cache')).rows
const fresh = async () => (await db.query(`select admin.template_breakeven_budget_now() breakeven,
  coalesce(admin.template_breakeven_budget_now(), admin.lowest_credit_price()*0.761*0.4) floor_budget`)).rows[0]
const reads = async () => (await db.query(`select admin.template_breakeven_budget() breakeven, admin.template_floor_budget() floor_budget,
  admin.template_margin_target_bp() margin`)).rows[0]
const spoil = () => db.query('update admin.template_floor_budget_cache set breakeven=1, floor_budget=1, margin_target_bp=1')

async function expectFresh() {
  const [stored] = await row()
  const now = await fresh()
  expect(stored.breakeven).toBe(now.breakeven)
  expect(stored.floor_budget).toBe(now.floor_budget)
  const r = await reads()
  expect(r.breakeven).toBe(now.breakeven)
  expect(r.floor_budget).toBe(now.floor_budget)
}

describe('stored budget', () => {
  it('holds one row equal to the calculation, with the policy margin', async () => {
    expect(await row()).toHaveLength(1)
    await expectFresh()
    expect((await reads()).margin).toBe(5000)
  })

  // Each trigger: spoil the stored row, write the table, and the row is the calculation again.
  const writes: Array<[string, string]> = [
    ['system_settings', "update public.system_settings set value=value where key='catalog_economics_policy'"],
    ['catalog_products', 'update admin.catalog_products set kind=kind'],
    ['catalog_product_versions', 'update admin.catalog_product_versions set listed=listed'],
    ['product_terms_v2', 'update admin.product_terms_v2 set credits=credits'],
    ['products', 'update public.products set active=active'],
    ['affiliates', 'update public.affiliates set status=status'],
    ['affiliate_rates', 'update public.affiliate_rates set l1_bp=l1_bp'],
    ['affiliate_rate_overrides', 'update public.affiliate_rate_overrides set l1_bp=l1_bp'],
  ]
  it.each(writes)('a write to %s refreshes it', async (_, sql) => {
    await spoil()
    expect((await row())[0].breakeven).toBe('1')
    await db.query(sql)
    await expectFresh()
  })

  it('follows real changes: affiliate rates, the policy and the catalogue version', async () => {
    const before = (await row())[0].breakeven
    const user = await createUser(db)
    await db.query("insert into public.affiliates(user_id,slug,status) values($1,'t1570-aff','active')", [user])
    for (const kind of ['pack', 'monthly', 'yearly'])
      await db.query('insert into public.affiliate_rate_overrides(user_id,product_kind,l1_bp) values($1,$2,4000)', [user, kind])
    expect(Number((await row())[0].breakeven)).toBeLessThan(Number(before))
    await expectFresh()
    await db.query("delete from public.system_settings where key='catalog_economics_policy'")
    expect((await reads()).breakeven).toBeNull()
    expect((await reads()).margin).toBeNull()
    await expectFresh()
    await seedCatalogPolicy(db)
    await db.query("update public.system_settings set value='\"v1\"' where key='pricing_catalog_version'")
    expect((await reads()).breakeven).toBeNull()
    await expectFresh()
  })

  it('falls back to the calculation when the row is missing', async () => {
    await db.query('delete from admin.template_floor_budget_cache')
    const now = await fresh()
    const r = await reads()
    expect(r.breakeven).toBe(now.breakeven)
    expect(r.floor_budget).toBe(now.floor_budget)
    expect(r.margin).toBe(5000)
  })
})

describe('route floors once per statement', () => {
  it('equal the uncached floors', async () => {
    const r = (await db.query(`select admin.alternate_route_floor($1,'1k','medium') a, admin.alternate_route_floor_now($1,'1k','medium') an,
      admin.fallback_route_floor($1,'2k','high') f, admin.fallback_route_floor_now($1,'2k','high') fn,
      admin.slot_route_floor($1,'1k','medium',3,7) s, admin.slot_route_floor_now($1,'1k','medium',3,7) sn,
      admin.alternate_route_floor('nope/x','1k','medium') missing, admin.fallback_route_floor('nope/x','1k','medium') fmissing`, [tag])).rows[0]
    expect(r.a).toEqual(r.an)
    expect(r.f).toBe(r.fn)
    expect(r.s).toBe(r.sn)
    expect(r.missing).toEqual((await db.query("select admin.alternate_route_floor_now('nope/x','1k','medium') v")).rows[0].v)
    expect(r.fmissing).toBeNull()
  })

  it('recompute after a provider write in the same statement', async () => {
    await db.query('create temp table t1570(a jsonb, b jsonb) on commit drop')
    await db.query(`do $$ declare a jsonb; b jsonb; begin
      a := admin.alternate_route_floor('${tag}','1k','medium');
      update public.ai_providers set estimated_image_costs='{"1k":1,"2k":0.02,"4k":0.03}' where id='${provider}';
      b := admin.alternate_route_floor('${tag}','1k','medium');
      insert into t1570 values (a, b);
    end $$`)
    const { a, b } = (await db.query('select a, b from t1570')).rows[0]
    expect(Number(b.credits)).toBeGreaterThan(Number(a.credits))
    expect(b).toEqual((await db.query(`select admin.alternate_route_floor_now($1,'1k','medium') v`, [tag])).rows[0].v)
  })

  it('ignore a memo set before the statement', async () => {
    const key = `alternate|'${tag}'|'1k'|'medium'`
    await db.query(`select set_config('shotviva.stmt_memo', statement_timestamp()::text || '|' || $1, false)`,
      [JSON.stringify({ [key]: { v: { credits: 1 } } })])
    const r = (await db.query(`select admin.alternate_route_floor($1,'1k','medium') a, admin.alternate_route_floor_now($1,'1k','medium') n`, [tag])).rows[0]
    expect(r.a).toEqual(r.n)
    await db.query("select set_config('shotviva.stmt_memo', 'garbage|{', false)")
    const g = (await db.query(`select admin.fallback_route_floor($1,'1k','medium') a, admin.fallback_route_floor_now($1,'1k','medium') n`, [tag])).rows[0]
    expect(g.a).toBe(g.n)
  })
})

it('lists 120 templates as anon well under 300 ms, computing each route floor once', async () => {
  const ids: string[] = []
  for (let i = 0; i < 120; i++) ids.push(await createPricedTemplate(db, { '1k': 500, '2k': 600, '4k': 700 }, i % 2 ? 'high' : 'medium'))
  await db.query(`insert into public.template_prompts(template_id,body,provider_id) select unnest($1::text[]),'Fixture',$2`, [ids, provider])
  await db.query("set local track_functions='all'")
  const calls = async () => Number((await db.query(`select coalesce(sum(calls),0) n from pg_stat_xact_user_functions
    where schemaname='admin' and funcname in ('alternate_route_floor_now','template_breakeven_budget_now')`)).rows[0].n)
  const before = await calls()
  await db.query('set local role anon')
  const started = performance.now()
  const rows = (await db.query('select t.id, public.template_image_options(t) from public.web_templates(null,null,true) t where t.id=any($1)', [ids])).rows
  const ms = performance.now() - started
  await db.query('reset role')
  expect(rows).toHaveLength(120)
  // Two qualities on one route here; without the memo this was one per template per check.
  expect((await calls()) - before).toBeLessThan(ids.length / 4)
  expect(ms).toBeLessThan(300)
})
