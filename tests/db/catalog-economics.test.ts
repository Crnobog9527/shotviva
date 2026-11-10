import type { Client } from 'pg'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { seedCatalogPolicy } from './catalog-policy'
import { connectAdmin } from './helpers'

let db: Client
beforeEach(async () => {
  db = await connectAdmin()
  await db.query('begin')
  await seedCatalogPolicy(db)
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
})
afterEach(async () => { await db.query('rollback'); await db.end() })

async function reject(query: string, message: string) {
  await db.query('savepoint invalid_terms')
  await expect(db.query(query)).rejects.toThrow(message)
  await db.query('rollback to invalid_terms')
}

it('keeps the template budget fixed and compares prices at the exact approved boundary', async () => {
  const snapshot = () => db.query('select admin.lowest_credit_price() as rate')
  const initial = (await snapshot()).rows
  const {usd_cents: cents, credits} = (await db.query("select usd_cents,credits from admin.product_terms_v2 where product_id='max_yearly'")).rows[0]
  expect(Number(initial[0].rate)).toBeCloseTo(cents / 100 / credits, 14)
  const { rows } = await db.query(`select admin.catalog_cost_ok('yearly',$1,$2) as exact,
    admin.catalog_cost_ok('yearly',$1::int-1,$2) as below, admin.catalog_cost_ok('monthly',$1,$2) as monthly`,[cents,credits])
  expect(rows[0]).toEqual({exact:true,below:false,monthly:false})
  await db.query("update admin.catalog_products set published_revision=null where product_id='max_yearly'")
  expect((await snapshot()).rows).toEqual(initial)
  await reject("select admin.validate_catalog_terms('pack_m',1599,2490,true)",'CATALOG_COST_FLOOR')
  await db.query("update public.affiliate_rates set l1_bp=1500 where product_kind='yearly'")
  expect((await db.query("select admin.catalog_cost_ok('yearly',$1,$2) as ok",[cents,credits])).rows[0].ok).toBe(false)
})

it('blocks a conflicting campaign at creation, reactivation, reprice and delisting', async () => {
  const campaign = `insert into public.codes(code,kind,active,discount_percent,discount_products,discount_duration,stripe_coupon_id)
    values('CATALOGQA','campaign',true,10,array['pack_s'],'once','coupon_qa')`
  await db.query(campaign)
  await reject("select admin.validate_catalog_terms('pack_s',990,990,false)",'CATALOG_CODE_FLOOR')
  await reject("select admin.validate_catalog_terms('pack_s',620,990,true)",'CATALOG_CODE_FLOOR')
  await db.query("update public.codes set active=false where code='CATALOGQA'")
  await db.query("update admin.catalog_products set published_revision=null where product_id='pack_s'")
  await reject("update public.codes set active=true where code='CATALOGQA'",'CODE_DISCOUNT_PRODUCTS')
  await reject(campaign.replace('CATALOGQA','CATALOGQB'),'CODE_DISCOUNT_PRODUCTS')
})
