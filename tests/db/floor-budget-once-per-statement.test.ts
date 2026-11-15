import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { seedCatalogPolicy } from './catalog-policy'
import { anonClient, connectAdmin, createPricedTemplate } from './helpers'

// 1569: with the policy row present, the break-even budget is computed once per statement. The
// production incident: public.web_templates checked ~115 templates' floors through it and passed
// anon's 3 s statement timeout. Synthetic policy.
const provider = randomUUID()
const COUNT = 120
let db: Client
let ids: string[]

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await seedCatalogPolicy(db)
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,estimated_image_costs)
    values($1,'T1569 fixture','openai_images','t1569-test','{1k,2k,3k}','{"1k":0.01,"2k":0.01,"3k":0.01}')`, [provider])
  ids = []
  for (let i = 0; i < COUNT; i++) ids.push(await createPricedTemplate(db, { '1k': 500, '2k': 600, '3k': 700 }))
  await db.query(`insert into public.template_prompts(template_id,body,provider_id) select unnest($1::text[]),'Fixture',$2`, [ids, provider])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

const computed = async () => Number((await db.query(`select coalesce(sum(calls),0) n from pg_stat_xact_user_functions
  where schemaname='admin' and funcname='template_breakeven_budget_now'`)).rows[0].n)

it('lists 120 templates as anon computing the budget once, well under a second', async () => {
  await db.query("set local track_functions='all'")
  const before = await computed()
  await db.query('set local role anon')
  await db.query("set local statement_timeout='1s'")
  const started = performance.now()
  const rows = (await db.query('select id from public.web_templates() where id=any($1)', [ids])).rows
  const ms = performance.now() - started
  await db.query('reset role')
  expect(rows).toHaveLength(COUNT)
  expect((await computed()) - before).toBe(1)
  expect(ms).toBeLessThan(1000)
})

it('gives the same budget as the uncached calculation, and each statement computes afresh', async () => {
  const both = async () => (await db.query('select admin.template_breakeven_budget() cached, admin.template_breakeven_budget_now() now')).rows[0]
  const first = await both()
  expect(first.cached).not.toBeNull()
  expect(first.cached).toBe(first.now)
  // The next statement sees a changed policy (no stale value within the transaction).
  await db.query(`update public.system_settings set value=jsonb_set(value,'{refund_bp}','900') where key='catalog_economics_policy'`)
  const second = await both()
  expect(second.cached).toBe(second.now)
  expect(Number(second.cached)).toBeLessThan(Number(first.cached))
  // And sees the policy disappear: back to no break-even budget, old floor budget.
  await db.query("delete from public.system_settings where key='catalog_economics_policy'")
  expect((await both()).cached).toBeNull()
  const { f, l } = (await db.query('select admin.template_floor_budget() f, admin.lowest_credit_price()*0.761*0.4 l')).rows[0]
  expect(Number(f)).toBeCloseTo(Number(l), 12)
})

// The per-statement cache lives in a custom setting. A value set before the statement (by anyone
// with SQL) must never be used: only what the function itself wrote during this statement counts.
it('ignores a pre-set or forged cache value', async () => {
  const honest = async () => (await db.query('select admin.template_breakeven_budget() b, admin.template_breakeven_budget_now() n')).rows[0]
  // Set in an earlier statement, at session and at transaction level, with a tiny budget.
  await db.query("select set_config('shotviva.breakeven_budget', statement_timestamp()::text || '|0.0000001', false)")
  let r = await honest()
  expect(r.b).toBe(r.n)
  await db.query("select set_config('shotviva.breakeven_budget', '2099-01-01 00:00:00+00|0.0000001', true)")
  r = await honest()
  expect(r.b).toBe(r.n)
  // A matching key but a value the function never writes is recomputed, not trusted or cast.
  const forged = (await db.query(`select (select set_config('shotviva.breakeven_budget', statement_timestamp()::text || '|x|1', true)) s,
    admin.template_breakeven_budget() b, admin.template_breakeven_budget_now() n`)).rows[0]
  expect(forged.b).toBe(forged.n)
  // The floors follow the honest budget.
  await db.query("select set_config('shotviva.breakeven_budget', statement_timestamp()::text || '|0.0000001', false)")
  expect(Number((await db.query('select admin.template_floor_budget() f')).rows[0].f)).toBeCloseTo(Number(r.n), 12)
})

it('clients cannot call set_config or the budget functions through the API', async () => {
  const anon = anonClient()
  expect((await anon.rpc('set_config', { setting_name: 'shotviva.breakeven_budget', new_value: 'x|0.0000001', is_local: false })).error).not.toBeNull()
  expect((await anon.rpc('template_breakeven_budget', {})).error).not.toBeNull()
})
