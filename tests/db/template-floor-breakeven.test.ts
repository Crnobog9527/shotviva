import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin, createPricedTemplate, createUser } from './helpers'

// 1568: every template floor divides by the worst-case break-even budget (lowest realised dollars
// per credit after each product kind's worst fee, read from catalog_economics_policy and the
// affiliate rate tables); without a valid policy the old 60%-margin budget stays. Synthetic policy.
const provider = randomUUID()
const tag = `${provider}/t1568-test`
const estimate = 0.05
let db: Client
let template: string

const num = async (sql: string, args: unknown[] = []) => Number(Object.values((await db.query(sql, args)).rows[0])[0])
const legacyBudget = () => num('select admin.lowest_credit_price()*0.761*0.4')
const floorBudget = () => num('select admin.template_floor_budget()')
const routeFloor = () => num("select (admin.alternate_route_floor($1,'1k','medium')->>'credits')::int", [tag])
const fallbackFloor = () => num("select admin.fallback_route_floor($1,'1k','medium')", [tag])
const setPrice = (price: number) => db.query(`update public.templates set credits_cost=jsonb_set(credits_cost,'{1k}',to_jsonb($2::int)) where id=$1`, [template, price])
const assertFloor = () => db.query('select admin.assert_template_sale_floor(t) from public.templates t where id=$1', [template])

// The rule in plain TypeScript, from the raw tables: min over listed products of price per credit
// (M/L packs at 0.85) x (1 - payment - refund - the highest commission for that kind).
async function expectedBreakeven() {
  const policy = (await db.query("select value from public.system_settings where key='catalog_economics_policy'")).rows[0].value
  const products = (await db.query(`select p.product_id id,p.kind,v.usd_cents cents,v.credits from admin.catalog_products p
    join admin.catalog_product_versions v on (v.product_id,v.revision)=(p.product_id,p.published_revision) where v.listed`)).rows
  const commission = async (kind: string) => num(`select greatest($2::int,
      (select l1_bp+l2_bp from public.affiliate_rates where product_kind=$1),
      (select max(coalesce(o.l1_bp,r.l1_bp)+case when parent.status='active' and parent.team_enabled then coalesce(po.l2_bp,r.l2_bp) else 0 end)
        from public.affiliates a join public.affiliate_rates r on r.product_kind=$1
        left join public.affiliate_rate_overrides o on (o.user_id,o.product_kind)=(a.user_id,$1)
        left join public.affiliates parent on parent.user_id=a.parent_user_id
        left join public.affiliate_rate_overrides po on (po.user_id,po.product_kind)=(parent.user_id,$1)
        where a.status='active'))`, [kind, kind === 'yearly' ? policy.yearly_commission_bp : policy.other_commission_bp])
  let min = Infinity
  for (const p of products) {
    const cents = ['pack_m', 'pack_l'].includes(p.id) ? Math.round(p.cents * 0.85) : p.cents
    const fee = policy.payment_bp + policy.refund_bp + await commission(p.kind)
    min = Math.min(min, cents / (100 * p.credits) * (10000 - fee) / 10000)
  }
  return min
}

beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await db.query("select pg_advisory_xact_lock_shared(hashtextextended('shotviva.template_catalog',0))")
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  await db.query("delete from public.system_settings where key='catalog_economics_policy'")
  template = await createPricedTemplate(db, { '1k': 1000, '2k': 1000, '3k': 1000 }, 'medium')
  await db.query(`insert into public.ai_providers(id,label,adapter,model,resolutions,capabilities,estimated_image_costs,extra_input_image_usd)
    values($1,'T1568 fixture','openrouter_images','t1568-test','{1k,2k}',$2,$3,0.01)`, [provider,
    { resolutions: ['1k', '2k'], aspectRatios: ['1:1'], originalRatio: false, minReferences: 0, maxReferences: 8, fetchedAt: new Date().toISOString() },
    { '1k': estimate, '2k': estimate }])
  await db.query('insert into public.template_prompts(template_id,body,provider_id) values($1,$2,$3)', [template, 'Fixture', provider])
})
afterEach(async () => { await db.query('rollback'); await db.end() })

describe('template floor budget', () => {
  it('keeps the old budget and no margin target without a policy', async () => {
    expect(await floorBudget()).toBeCloseTo(await legacyBudget(), 12)
    expect((await db.query('select admin.template_breakeven_budget() b, admin.template_margin_target_bp() m')).rows[0]).toEqual({ b: null, m: null })
    expect(await routeFloor()).toBe(Math.ceil(estimate * 1.10 / await legacyBudget()))
  })

  it('is the worst-case break-even with a policy, and follows the affiliate tables', async () => {
    await seedCatalogPolicy(db)
    const breakeven = await expectedBreakeven()
    expect(await floorBudget()).toBeCloseTo(breakeven, 12)
    expect(await num('select admin.template_margin_target_bp()')).toBe(5000)
    expect(await floorBudget()).toBeGreaterThan(await legacyBudget())
    expect(await routeFloor()).toBe(Math.ceil(estimate * 1.10 / breakeven))
    expect(await fallbackFloor()).toBe(Math.ceil(estimate * 1.10 / breakeven))

    // A higher effective rate for one active affiliate lowers the budget: never hard-coded.
    const user = await createUser(db)
    await db.query("insert into public.affiliates(user_id,slug,status) values($1,'t1568-aff','active')", [user])
    for (const kind of ['pack', 'monthly', 'yearly'])
      await db.query('insert into public.affiliate_rate_overrides(user_id,product_kind,l1_bp) values($1,$2,4000)', [user, kind])
    const raised = await expectedBreakeven()
    expect(raised).toBeLessThan(breakeven)
    expect(await floorBudget()).toBeCloseTo(raised, 12)
  })

  it('save and open sale refuse a price under the break-even floor and accept the floor', async () => {
    await seedCatalogPolicy(db)
    const floor = await routeFloor()
    expect(floor).toBeLessThan(Math.ceil(estimate * 1.10 / await legacyBudget()))
    await setPrice(floor - 1)
    await expect(assertFloor()).rejects.toThrow(/TEMPLATE_PRICE_BELOW_FLOOR/)
    await setPrice(floor)
    await expect(assertFloor()).resolves.toBeDefined()
  })

  it('slot templates use the same budget, and 5-8 slot jobs reach a measured p95', async () => {
    await seedCatalogPolicy(db)
    const budget = await floorBudget()
    const single = await routeFloor()
    expect(await num('select admin.slot_route_floor($1,$2,$3,3,$4)', [tag, '1k', 'medium', single]))
      .toBe(single + Math.ceil(2 * 0.01 * 1.10 / budget))
    const user = await createUser(db)
    await db.query('set local session_replication_role = replica')
    const slots = Array.from({ length: 6 }, (_, i) => ({ key: `s${i}`, upload: `inputs/u/${i}.png` }))
    await db.query(`insert into public.generation_jobs (id,user_id,module,template_id,inputs,provider,source,status,
        visibility,credits_cost,credit_pool,cost_usd,output_key,finished_at)
      select gen_random_uuid(),$1,'image',$2,$3,$4,'web','succeeded','private',1,'paid',0.2,'t1568/x',now() from generate_series(1,10)`,
    [user, template, JSON.stringify({ resolution: '1k', quality: 'medium', input_slots: slots }), tag])
    const costs = (await db.query('select admin.route_slot_costs($1) c', [tag])).rows[0].c
    expect(costs.p95_full.medium['1k']['6']).toBeCloseTo(0.2)
    expect(await num('select admin.slot_route_floor($1,$2,$3,6,$4)', [tag, '1k', 'medium', single]))
      .toBe(Math.max(single, Math.ceil(0.2 * 1.10 / budget)))
  })

  it('the editor read carries the same budget and the margin target', async () => {
    const before = (await db.query("select public.admin_image_pricing_catalog('fallback') c")).rows[0].c
    expect(before.floor_budget).toBeCloseTo(await legacyBudget(), 12)
    expect(before.breakeven_budget).toBeNull()
    await seedCatalogPolicy(db)
    const after = (await db.query("select public.admin_image_pricing_catalog('fallback') c")).rows[0].c
    expect(after.floor_budget).toBe(after.breakeven_budget)
    expect(after.floor_budget).toBeCloseTo(await expectedBreakeven(), 12)
    expect(after.margin_target_bp).toBe(5000)
    expect(after.unit_price).toBe(before.unit_price)
  })
})

// Rollout: 1568 reaches production on merge, before anyone writes the policy row. Every check must
// then behave exactly as before (the old budget), never error or block.
describe('before the policy row exists (production at deploy)', () => {
  const legacyFloor = async () => Math.ceil(estimate * 1.10 / await legacyBudget())
  const allowed = (price: number, fallback: boolean) => db.query(
    "select admin.reservation_route_allowed(t,$2,'1k',$3,$4,true) ok from public.templates t where id=$1", [template, tag, price, fallback])

  it('the four floors and the editor read equal the old formula', async () => {
    const floor = await legacyFloor()
    expect(await routeFloor()).toBe(floor)
    expect(await fallbackFloor()).toBe(floor)
    expect(await num('select admin.slot_route_floor($1,$2,$3,3,$4)', [tag, '1k', 'medium', floor]))
      .toBe(floor + Math.ceil(2 * 0.01 * 1.10 / await legacyBudget()))
    const read = (await db.query("select public.admin_image_pricing_catalog('fallback') c")).rows[0].c
    expect(read).toMatchObject({ breakeven_budget: null, margin_target_bp: null })
    expect(read.floor_budget).toBeCloseTo(await legacyBudget(), 12)
  })

  it('save and sale checks keep the old floor without erroring', async () => {
    const floor = await legacyFloor()
    await setPrice(floor)
    await expect(assertFloor()).resolves.toBeDefined()
    await setPrice(floor - 1)
    await expect(assertFloor()).rejects.toThrow(/TEMPLATE_PRICE_BELOW_FLOOR/)
  })

  it('the reservation re-check keeps the old floor without erroring', async () => {
    const floor = await legacyFloor()
    await setPrice(floor)
    expect((await allowed(floor, true)).rows[0].ok).toBe(true)
    expect((await allowed(floor - 1, true)).rows[0].ok).toBe(false)
    expect((await allowed(floor - 1, false)).rows[0].ok).toBe(true)
  })

  it('an invalid policy row is the same as none', async () => {
    await db.query(`insert into public.system_settings(key,value) values('catalog_economics_policy','{"payment_bp":"x"}')`)
    expect(await floorBudget()).toBeCloseTo(await legacyBudget(), 12)
    expect(await routeFloor()).toBe(await legacyFloor())
  })
})

// The policy row is written through admin_set_system_setting (scripts/set-catalog-policy.ts).
describe('admin_set_system_setting catalog_economics_policy', () => {
  const policy = { payment_bp: 850, refund_bp: 250, yearly_commission_bp: 1301, other_commission_bp: 2001, margin_bp: 5000 }
  const write = (value: unknown, actor: string) =>
    db.query("select public.admin_set_system_setting('catalog_economics_policy',$1::jsonb,$2)", [JSON.stringify(value), actor])
  const admin = async () => {
    const id = await createUser(db)
    await db.query("update public.profiles set role='admin' where id=$1", [id])
    return id
  }

  it('stores a valid policy that the floors then use', async () => {
    const actor = await admin()
    await write(policy, actor)
    expect((await db.query("select value, updated_by from public.system_settings where key='catalog_economics_policy'")).rows[0])
      .toEqual({ value: policy, updated_by: actor })
    expect(await num('select admin.template_margin_target_bp()')).toBe(5000)
  })

  it('refuses a malformed policy, a non-admin and a banned admin', async () => {
    const actor = await admin()
    const missing: Partial<typeof policy> = { ...policy }
    delete missing.margin_bp
    for (const bad of [{ ...policy, extra: 1 }, { ...policy, refund_bp: 1.5 }, { ...policy, refund_bp: '250' },
      { ...policy, payment_bp: 5000, refund_bp: 4000, other_commission_bp: 1000 }, missing, [1]]) {
      await db.query('savepoint s')
      await expect(write(bad, actor)).rejects.toThrow(/INVALID_INPUT/)
      await db.query('rollback to savepoint s')
    }
    await db.query('savepoint s')
    await expect(write(policy, await createUser(db))).rejects.toThrow(/NOT_ADMIN/)
    await db.query('rollback to savepoint s')
    await db.query('update public.profiles set banned_at=now() where id=$1', [actor])
    await expect(write(policy, actor)).rejects.toThrow(/NOT_ADMIN/)
  })
})
