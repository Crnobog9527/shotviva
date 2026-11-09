import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createUser, profileOf } from './helpers'

let db: Client
let user: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  // Other suites leave accounts with live subscriptions. Model the audited cohort locally;
  // this transaction (including TRUNCATE) is rolled back after every case.
  await db.query('truncate table public.profiles cascade')
  user = await createUser(db)
  await db.query("select public.admin_adjust_credits($1,22,'gift','paid')", [user])
  await db.query("select public.admin_adjust_credits($1,4,'gift','free')", [user])
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const baseline = async () => (await db.query(`select admin.wallet_digest_v2() as hash,
  (select coalesce(max(id),0) from public.credit_ledger) as tip,(select count(*) from public.payments) as orders`)).rows[0]
const clear = (b: { hash: string; tip: string; orders: string }) =>
  db.query('select admin.clear_approved_wallets_v2($1,$2,$3)',[b.hash,b.tip,b.orders])

it('clears only a reviewed snapshot, repeats safely, restores through reversing ledger entries', async () => {
  const b = await baseline()
  await clear(b)
  await clear(b)
  expect(await profileOf(db,user)).toMatchObject({ credits: 0, free_credits: 0 })
  await db.query('select admin.restore_approved_wallets_v2()')
  await db.query('select admin.restore_approved_wallets_v2()')
  expect(await profileOf(db,user)).toMatchObject({ credits: 22, free_credits: 4 })
  expect((await baseline()).hash).toBe(b.hash)
})

it('refuses when a new account appears after the snapshot was approved', async () => {
  const b = await baseline()
  await createUser(db)
  await expect(clear(b)).rejects.toThrow('CUTOVER_BASELINE_CHANGED')
})

it('waives outstanding old refunds before enabling new purchases, so a replay takes nothing', async () => {
  await db.query("select public.settle_checkout($1,'pack_s','cs_before_cutover',990,'usd',0,'card')",[user])
  const pay = (await db.query("update public.payments set status='refunded',amount_refunded=amount_total where stripe_session_id='cs_before_cutover' returning id")).rows[0]
  await clear(await baseline())
  await db.query("select public.settle_checkout_v2($1,'pack_s','cs_after_cutover',990,'usd',0,'card')",[user])
  const r = (await db.query("select public.clawback_payment_credits($1,'repeat','repeat') as r",[pay.id])).rows[0].r
  expect(r).toMatchObject({ taken:0, written_off:0, clawback_shortfall:20 })
  expect((await profileOf(db,user)).credits).toBe(990)
})

it('will not undo new economic activity', async () => {
  await clear(await baseline())
  await db.query("select public.admin_adjust_credits($1,990,'new order','paid')",[user])
  await expect(db.query('select admin.restore_approved_wallets_v2()')).rejects.toThrow('ECONOMIC_ACTIVITY_AFTER_CUTOVER')
})

it('awards 100 only for a post-switch signup, even from a stale client; replay does not award twice', async () => {
  await db.query("update public.profiles set created_at=now()-interval '1 day' where id=$1",[user])
  await db.query(`insert into public.system_settings(key,value,updated_at) values('pricing_catalog_version','"v2"',now())
    on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at`)
  const signup = (id: string) => db.query("select * from public.grant_credits($1::uuid,6,'signup','signup:'||($1::uuid)::text,'free')",[id])
  expect((await signup(user)).rows[0].applied).toBe(false)
  const newcomer = await createUser(db)
  expect((await signup(newcomer)).rows[0]).toMatchObject({ applied:true, free_credits:100 })
  expect((await signup(newcomer)).rows[0]).toMatchObject({ applied:false, free_credits:100 })
})
