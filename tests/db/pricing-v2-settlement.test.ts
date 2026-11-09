import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { beforeAll, beforeEach, afterAll, afterEach, expect, it } from 'vitest'
import { connectAdmin, createUser, profileOf } from './helpers'

let db: Client
let buyer: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => { await db.query('begin'); await db.query("delete from public.system_settings where key='pricing_catalog_version'"); buyer = await createUser(db) })
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const activate = () => db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
  on conflict(key) do update set value=excluded.value`)

it('leaves legacy orders intact and grants all pack credits at the discounted price plus tax', async () => {
  const buy = (v2: boolean, key: string) => db.query(
    'select * from public.settle_checkout' + (v2 ? '_v2' : '') + "($1,'pack_m',$2,$3,'usd',100,'card')",
    [buyer, key, v2 ? 2217 : 2590])
  const legacy = await buy(false, 'cs_old')
  expect(legacy.rows[0].credits).toBe(55)
  await activate()
  expect((await buy(true, 'cs_new')).rows[0].credits).toBe(2545)
  expect((await buy(true, 'cs_new')).rows[0].applied).toBe(false)
  const payment = (await db.query("select id,amount_total,amount_tax from public.payments where stripe_session_id='cs_new'")).rows[0]
  expect(payment).toMatchObject({ amount_total: 2217, amount_tax: 100 })
  await db.query("update public.payments set status='refunded', amount_refunded=amount_total where id=$1",[payment.id])
  const refund = () => db.query("select public.clawback_payment_credits($1,'refund_1','refund') as r", [payment.id])
  expect((await refund()).rows[0].r.taken).toBe(2490)
  expect((await refund()).rows[0].r.taken).toBe(0)
  expect((await profileOf(db,buyer)).credits).toBe(55)
})

it('grants an entire Waffo annual term once per payment, and does not extend the term for packs', async () => {
  await activate()
  const order = randomUUID()
  const pay = (key: string, product: string, cents: number) => db.query(
    "select * from public.settle_waffo_order_v2($1,$2,$3,$4,$5,'usd',0,'card')", [buyer,product,key,order,cents])
  const first = (await pay('PAY_first','max_yearly',89100)).rows[0]
  expect(first.credits).toBe(168000)
  expect((await pay('PAY_first','max_yearly',89100)).rows[0].applied).toBe(false)
  const pack = (await pay('PAY_pack','pack_l',4242)).rows[0]
  expect(pack.credits).toBe(172990)
  expect(pack.paid_until).toEqual(first.paid_until)
})

it('keeps contract-specific annual renewal amounts and invoice idempotency', async () => {
  const renew = (v2: boolean, id: string) => db.query('select * from public.apply_subscription_renewal'
    + (v2 ? '_v2' : '') + "($1,'pro_yearly',$2,now()+interval '1 year',$3,'usd',0,'card')", [buyer,id,v2 ? 47904 : 47900])
  expect((await renew(false,'in_old')).rows[0].credits).toBe(1620)
  await activate()
  expect((await renew(true,'in_new')).rows[0].credits).toBe(73620)
  expect((await renew(true,'in_new')).rows[0].applied).toBe(false)
  expect((await db.query('select count(*)::int as n from public.payments where user_id=$1',[buyer])).rows[0].n).toBe(2)
})

it('retains the original annual price after the unit switch and grants in wallet units', async () => {
  const renew = (key: string) => db.query("select * from public.apply_subscription_renewal($1,'max_yearly',$2,now()+interval '1 year',71300,'usd',0,'card')",[buyer,key])
  expect((await renew('in_legacy_before')).rows[0].credits).toBe(3360)
  await activate()
  expect((await renew('in_legacy_before')).rows[0].applied).toBe(false)
  expect((await renew('in_legacy_next')).rows[0].credits).toBe(3360 + 168000)
  expect((await db.query("select amount_total from public.payments where stripe_invoice_id='in_legacy_next'")).rows[0].amount_total).toBe(71300)
})

it.each([
  ['Stripe checkout', "public.settle_checkout_v2($1,'pack_s',$2,990,'usd',0,'card')", 'cs_'],
  ['Stripe renewal', "public.apply_subscription_renewal_v2($1,'max_yearly',$2,now()+interval '1 year',89100,'usd',0,'card')", 'in_'],
  ['Waffo order', "public.settle_waffo_order_v2($1,'pack_s',$2,'ORD_1',990,'usd',0,'card')", 'PAY_'],
])('allows replay but quarantines a new late %s payment on a v1 wallet', async (_label, rpc, prefix) => {
  const settle = (id: string) => db.query('select * from ' + rpc, [buyer, prefix + id])
  await activate()
  const original = (await settle('paid')).rows[0]
  await db.query("delete from public.system_settings where key='pricing_catalog_version'")
  expect((await settle('paid')).rows[0]).toMatchObject({ applied: false, credits: original.credits })
  await db.query('savepoint late')
  await expect(settle('late')).rejects.toThrow('PRICING_VERSION_RECONCILIATION_REQUIRED')
  await db.query('rollback to late')
  expect((await profileOf(db, buyer)).credits).toBe(original.credits)
  expect((await db.query('select count(*)::int as n from payments where user_id=$1', [buyer])).rows[0].n).toBe(1)
})

it('exposes no grant or second catalog to anonymous or authenticated clients', async () => {
  for (const role of ['anon','authenticated']) {
    const result = await db.query(`select bool_or(has_function_privilege($1,p.oid,'execute')) as executable
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='public' and p.proname in ('settle_checkout_v2','apply_subscription_renewal_v2','settle_waffo_order_v2'))
        or (n.nspname='admin' and p.proname in ('purchase_terms','renewal_terms','waffo_terms','checkout_terms'))`,[role])
    expect(result.rows[0].executable).toBe(false)
    expect((await db.query("select has_table_privilege($1,'admin.product_terms_v2','select') as ok",[role])).rows[0].ok).toBe(false)
  }
})
