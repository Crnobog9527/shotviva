import type { Client } from 'pg'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { connectAdmin, createUser } from './helpers'
import { seedCatalogPolicy } from './catalog-policy'

let sql: Client
let actor: string
let ordinary: string
beforeEach(async () => {
  sql = await connectAdmin()
  await sql.query('begin')
  await seedCatalogPolicy(sql)
  actor = await createUser(sql)
  ordinary = await createUser(sql)
  await sql.query("update public.profiles set role='admin' where id=$1",[actor])
  await sql.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
})
afterEach(async () => { await sql.query('rollback'); await sql.end() })
const data = { name_en: 'M pack',name_zh: '中包',benefit_en: 'Studio credits',benefit_zh: '摄影积分',usd_cents: 3500,credits: 1441,sort_order: 8,listed: true }
const save = (user: string, previous: string | null = null) => sql.query<{id:string}>(
  "select public.admin_catalog_save($1,'pack_m',2,$2,$3,'调整价格') id",[user,previous,data])
const prices = (prefix: string) => Object.fromEntries(['','_starter','_pro','_max'].map((suffix,i) => ['pack_m_v2'+suffix,'price_'+prefix+i]))
const prepare = (id: string) => sql.query("select public.admin_catalog_prepare($1,$2,'acct_test',false,$3)",[actor,id,prices('Old')])
const publish = (id: string, bindings: Record<string,string>) => sql.query("select public.admin_catalog_publish($1,$2,'acct_test',false,$3)",[actor,id,bindings])
async function rejected(f: () => Promise<unknown>, code: string) {
  await sql.query('savepoint attempt')
  await expect(f()).rejects.toThrow(code)
  await sql.query('rollback to attempt')
}

it('locks the reviewed draft and freezes four old prices before returning the manual checklist', async () => {
  await rejected(() => save(ordinary),'NOT_ADMIN')
  const published = await sql.query("select revision,usd_cents from read_product_catalog('v2') where product_id='pack_m'")
  const first = (await save(actor)).rows[0]!.id
  await rejected(() => save(actor),'CATALOG_STALE')
  const id = (await save(actor,first)).rows[0]!.id
  await rejected(() => prepare(first),'CATALOG_STALE')
  await prepare(id)
  await rejected(() => save(actor,id),'CATALOG_STALE')
  await rejected(() => publish(id,{pack_m_v2:'price_New'}),'CATALOG_INVALID_BINDINGS')
  expect((await sql.query("select revision,usd_cents from read_product_catalog('v2') where product_id='pack_m'")).rows[0])
    .toEqual(published.rows[0])
  await publish(id,prices('New'))
  await publish(id,prices('New'))
  expect((await sql.query("select revision,usd_cents from read_product_catalog('v2') where product_id='pack_m'")).rows[0])
    .toEqual({revision:4,usd_cents:3500})
  expect((await sql.query("select count(*)::int n from admin.catalog_stripe_prices where product_id='pack_m'")).rows[0].n).toBe(8)
  expect((await sql.query("select count(*)::int n from public.admin_audit_log where action='catalog_publish' and user_id=$1",[actor])).rows[0].n).toBe(1)
  expect((await sql.query('select public.admin_catalog_archivable($1,$2) ids',[actor,id])).rows[0].ids).toEqual([])
})

it('keeps an unpublished new identity private and refuses preparing a second Stripe account', async () => {
  const oldId = (await save(actor)).rows[0]!.id
  await prepare(oldId)
  const id = (await sql.query("select public.admin_catalog_save($1,'pack_extra',null,null,$2,'新增积分包') id",[actor,data])).rows[0].id
  const before = await sql.query("select product_id from read_product_catalog('v2') where product_id='pack_extra'")
  expect(before.rowCount).toBe(0)
  await rejected(() => sql.query("select public.admin_catalog_prepare($1,$2,'acct_wrong',false,'{}')",[actor,id]),'CATALOG_ENVIRONMENT')
  await sql.query("select public.admin_catalog_prepare($1,$2,'acct_test',false,'{}')",[actor,id])
  await publish(id,{pack_extra_v2:'price_NewPack'})
  expect((await sql.query("select product_id from read_product_catalog('v2') where product_id='pack_extra'")).rowCount).toBe(1)
  expect((await sql.query("select product_id from read_product_catalog('v1') where product_id='pack_extra'")).rowCount).toBe(0)
})

it('only offers archive after the last payable checkout expires and keeps each historical binding', async () => {
  const id = (await save(actor)).rows[0]!.id
  await prepare(id)
  await publish(id,prices('New'))
  await sql.query("update admin.catalog_publications set published_at=now()-interval '25 hours' where id=$1",[id])
  await sql.query(`insert into admin.catalog_checkout_attempts(token,user_id,product_id,revision,channel,request_hash,price_id,unit_cents,
    net_cents,credits,method,form,expires_at,params) values(gen_random_uuid(),$1,'pack_m',2,'stripe','test','price_Old0',
    1531,1531,1551,'card','one_time',now()+interval '1 hour','{}')`,[actor])
  const available = async () => (await sql.query('select public.admin_catalog_archivable($1,$2) ids',[actor,id])).rows[0].ids as string[]
  expect(await available()).not.toContain('price_Old0')
  expect(await available()).toContain('price_Old1')
  await rejected(() => sql.query("select public.admin_catalog_archive($1,$2,'price_Old0')",[actor,id]),'CATALOG_STILL_IN_USE')
  await sql.query("update admin.catalog_checkout_attempts set expires_at=now()-interval '1 second' where price_id='price_Old0'")
  await sql.query("select public.admin_catalog_archive($1,$2,'price_Old0')",[actor,id])
  expect(await available()).not.toContain('price_Old0')
  expect((await sql.query("select revision from admin.catalog_stripe_prices where price_id='price_Old0' and archived_at is not null")).rows).toEqual([{revision:2}])
})

it('keeps the selected membership tier separate from its slug and requires both channel forms', async () => {
  const sku='studio_yearly'
  const id=(await sql.query("select public.admin_catalog_save($1,$2,null,null,$3,'新增年付') id",[actor,sku,{ ...data, tier:'pro' }])).rows[0].id
  expect((await sql.query('select days from public.products where id=$1',[sku])).rows[0].days).toBe(365)
  const want=await sql.query('select lookup_key,stripe_product from admin.catalog_price_forms($1,3) order by lookup_key',[sku])
  expect(want.rows).toEqual([{lookup_key:sku+'_recurring_v2',stripe_product:'shotviva_pro'},{lookup_key:sku+'_v2',stripe_product:'shotviva_pro'}])
  await sql.query("select public.admin_catalog_prepare($1,$2,'acct_test',false,'{}')",[actor,id])
  await rejected(()=>publish(id,{[sku+'_v2']:'price_Studio'}),'CATALOG_INVALID_BINDINGS')
})

it('continues to show history with no private policy and refuses a previously prepared release', async () => {
  const id = (await save(actor)).rows[0]!.id
  await prepare(id)
  await sql.query("delete from public.system_settings where key='catalog_economics_policy'")
  const detail = (await sql.query("select public.admin_catalog_editor($1,'pack_m') item",[actor])).rows[0].item
  expect(detail.budget).toBeNull()
  expect(detail.fees).toBeNull()
  expect(detail.history).toEqual(expect.arrayContaining([expect.objectContaining({id,status:'prepared'})]))
  await rejected(() => publish(id,prices('New')), 'CATALOG_POLICY_REQUIRED')
})
