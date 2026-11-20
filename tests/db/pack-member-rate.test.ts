import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'
import { seedCatalogPolicy } from './catalog-policy'

// Migration 1610: the M / L pack member rate belongs to the catalogue revision. Revisions that
// existed before it keep 95 / 90 / 85; drafts saved later get the 2026-11-21 rate 100 / 95 / 90, and the
// revision on sale decides what checkout accepts.
let sql: Client
let actor: string
let buyer: string
beforeEach(async () => {
  sql = await connectAdmin()
  await sql.query('begin')
  await seedCatalogPolicy(sql)
  actor = await createUser(sql)
  buyer = await createUser(sql)
  await sql.query("update public.profiles set role='admin' where id=$1", [actor])
  await sql.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
})
afterEach(async () => { await sql.query('rollback'); await sql.end() })

async function rejected(f: () => Promise<unknown>, code: string) {
  await sql.query('savepoint attempt')
  await expect(f()).rejects.toThrow(code)
  await sql.query('rollback to attempt')
}

const forms = async (revision: number) => Object.fromEntries((await sql.query<{ lookup_key: string; usd_cents: number }>(
  'select lookup_key,usd_cents from admin.catalog_price_forms($1,$2)', ['pack_m', revision])).rows.map(r => [r.lookup_key, r.usd_cents]))
const published = async () => (await sql.query<{ r: number }>("select published_revision r from admin.catalog_products where product_id='pack_m'")).rows[0]!.r
// Waffo skips the campaign lookup; the member price is the only accepted quote.
const terms = (cents: number) => sql.query("select admin.catalog_buyer_terms($1,'pack_m',2490,gen_random_uuid(),'waffo',$2,$2,null,'{}')", [buyer, cents])

async function becomeMember(tier: 'starter' | 'pro') {
  await sql.query("update public.profiles set paid_until=now()+interval '30 days' where id=$1", [buyer])
  await sql.query(`insert into public.credit_ledger(user_id,kind,delta,balance_after,reason,idempotency_key,product_id,pool)
    values($1,'purchase',100,100,'test membership','test:'||$2,$2,'paid')`, [buyer, tier + '_monthly'])
}

async function publishO2Draft() {
  const data = { name_en: 'M pack', name_zh: '中包', benefit_en: '', benefit_zh: '', usd_cents: 2490, credits: 2490, sort_order: 8, listed: true }
  const id = (await sql.query<{ id: string }>("select public.admin_catalog_save($1,'pack_m',$2,null,$3,'新会员价') id",
    [actor, await published(), data])).rows[0]!.id
  const prices = (prefix: string) => Object.fromEntries(['', '_starter', '_pro', '_max'].map((s, i) => ['pack_m_v2' + s, 'price_' + prefix + i]))
  await sql.query("select public.admin_catalog_prepare($1,$2,'acct_test',false,$3)", [actor, id, prices('Old')])
  await sql.query("select public.admin_catalog_publish($1,$2,'acct_test',false,$3)", [actor, id, prices('O2')])
  return published()
}

it('keeps 95 / 90 / 85 on the revision on sale and gives a new draft 100 / 95 / 90', async () => {
  const before = await published()
  expect(await forms(before)).toEqual({ pack_m_v2: 2490, pack_m_v2_starter: 2366, pack_m_v2_pro: 2241, pack_m_v2_max: 2117 })
  const o2 = await publishO2Draft()
  expect(o2).toBeGreaterThan(before)
  expect(await forms(o2)).toEqual({ pack_m_v2: 2490, pack_m_v2_starter: 2490, pack_m_v2_pro: 2366, pack_m_v2_max: 2241 })
  expect(await forms(before)).toEqual({ pack_m_v2: 2490, pack_m_v2_starter: 2366, pack_m_v2_pro: 2241, pack_m_v2_max: 2117 })
  // Bound member Prices of the new revision carry its own amounts.
  expect((await sql.query("select lookup_key,usd_cents from admin.catalog_stripe_prices where product_id='pack_m' and revision=$1 order by lookup_key", [o2])).rows)
    .toEqual([{ lookup_key: 'pack_m_v2', usd_cents: 2490 }, { lookup_key: 'pack_m_v2_max', usd_cents: 2241 },
      { lookup_key: 'pack_m_v2_pro', usd_cents: 2366 }, { lookup_key: 'pack_m_v2_starter', usd_cents: 2490 }])
  const rates = await sql.query("select revision,starter_pct,pro_pct,max_pct from public.read_catalog_member_rates() where product_id='pack_m' and revision in ($1,$2) order by revision", [before, o2])
  expect(rates.rows).toEqual([{ revision: before, starter_pct: 95, pro_pct: 90, max_pct: 85 }, { revision: o2, starter_pct: 100, pro_pct: 95, max_pct: 90 }])
})

it('quotes checkout at the member rate of the revision on sale', async () => {
  await becomeMember('starter')
  await terms(2366)
  await rejected(() => terms(2490), 'CODE_CHECKOUT_OFFER_CHANGED')
  await publishO2Draft()
  await terms(2490)
  await rejected(() => terms(2366), 'CODE_CHECKOUT_OFFER_CHANGED')
  await becomeMember('pro')
  await terms(2366)
})

it('serves the member rates to the server only and rejects an out-of-range rate', async () => {
  for (const role of ['anon', 'authenticated'])
    expect((await sql.query("select has_function_privilege($1,'public.read_catalog_member_rates()','execute') ok", [role])).rows[0].ok).toBe(false)
  expect((await sql.query("select has_function_privilege('service_role','public.read_catalog_member_rates()','execute') ok")).rows[0].ok).toBe(true)
  await rejected(() => sql.query("update admin.catalog_product_versions set pack_member_pay_pct='{100,95}' where product_id='pack_m'"), 'catalog_versions_pack_member_pay_pct_check')
  await rejected(() => sql.query("update admin.catalog_product_versions set pack_member_pay_pct='{100,95,40}' where product_id='pack_m'"), 'catalog_versions_pack_member_pay_pct_check')
})

// The 2026-11-21 plan changes credits only: a new plan revision at the same price binds the Prices
// already in Stripe, and checkout grants the new revision's credits (they belong to the revision).
it('publishes a credits-only plan revision on the same Stripe Prices and grants its credits', async () => {
  const sku = 'pro_monthly'
  const base = (await sql.query<{ r: number }>('select published_revision r from admin.catalog_products where product_id=$1', [sku])).rows[0]!.r
  const data = { name_en: 'Pro', name_zh: '专业版', benefit_en: '', benefit_zh: '', usd_cents: 4990, credits: 5500, sort_order: 3, listed: true }
  const id = (await sql.query<{ id: string }>("select public.admin_catalog_save($1,$2,$3,null,$4,'只改积分') id", [actor, sku, base, data])).rows[0]!.id
  const same = { pro_monthly_v2: 'price_ProOnce', pro_monthly_recurring_v2: 'price_ProCycle' }
  await sql.query("select public.admin_catalog_prepare($1,$2,'acct_test',false,$3)", [actor, id, same])
  await sql.query("select public.admin_catalog_publish($1,$2,'acct_test',false,$3)", [actor, id, same])
  const offer = (await sql.query("select revision,usd_cents,credits from public.read_catalog_offers('v2') where product_id=$1", [sku])).rows[0]
  expect(offer).toEqual({ revision: base + 1, usd_cents: 4990, credits: 5500 })
  expect((await sql.query('select revision,price_id from admin.catalog_stripe_prices where product_id=$1 and lookup_key=$2 order by revision', [sku, 'pro_monthly_recurring_v2'])).rows)
    .toEqual([{ revision: base, price_id: 'price_ProCycle' }, { revision: base + 1, price_id: 'price_ProCycle' }])
  await sql.query(`select public.lock_catalog_checkout($1,gen_random_uuid(),'test',$2,$3,'stripe','pro_monthly_recurring_v2','price_ProCycle',4990,4990,null,'card','subscription',
    jsonb_build_object('expires_at',extract(epoch from now()+interval '1 hour')::int))`, [buyer, sku, base + 1])
  expect((await sql.query('select revision,credits,price_id from admin.catalog_checkout_attempts where user_id=$1', [buyer])).rows)
    .toEqual([{ revision: base + 1, credits: 5500, price_id: 'price_ProCycle' }])
})
