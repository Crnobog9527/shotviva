import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { exportCsv } from '@/core/affiliate/admin/export'
import { commissions, payouts, loadMember, referred } from '@/core/affiliate/admin/read'
import { loadUser } from '@/core/admin/users/repository'
import { findUser, overview } from '@/core/affiliate/admin/summary'
import { connectAdmin, createUser } from './helpers'
import { serviceSupabase } from './supabase-env'

let db: Client, actor: string, owner: string, buyer: string, other: string
let flaggedId: string
let slug: string
beforeAll(async () => {
  db = await connectAdmin()
  actor = await createUser(db)
  owner = await createUser(db)
  other = await createUser(db)
  buyer = await createUser(db)
  slug = 'qa-' + randomUUID().slice(0, 12)
  await db.query("update profiles set role='admin' where id=$1", [actor])
  await db.query("insert into affiliates(user_id,slug,status) values ($1,$2,'active'),($3,$4,'active')", [owner, slug, other, slug + '-o'])
  const sale = await db.query(
    "insert into payments(user_id,product_id,channel,amount_total,currency,method,stripe_session_id) values($1,'pack_m','stripe',2490,'usd','card',$2) returning id",
    [buyer, 'cs_' + randomUUID()],
  )
  await db.query("update profiles set referred_by=$1,referred_at=now(),referred_source='admin' where id=$2", [owner, buyer])
  const insert = await db.query(
    `insert into affiliate_commissions(payment_id,affiliate_user_id,level,product_id,rate_bp,base_usd,amount,status,confirm_after,flags)
    values($1,$2,1,'pack_m',1500,2490,373,'on_hold',now(),array['same_ip']),($1,$3,2,'pack_m',500,2490,124,'pending',now(),'{}') returning id`,
    [sale.rows[0].id, owner, other],
  )
  flaggedId = String(insert.rows[0].id)
  await db.query(
    `insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot)
    values ($1,current_date,20000,'due',$2::jsonb)`,
    [owner, JSON.stringify({ payout_method: 'wise', payout_details: '=sensitive-test-formula()' })],
  )
})
afterAll(async () => {
  // Delete only this suite's accounts; foreign keys cascade to the fixtures.
  if (db) {
    await db.query('delete from auth.users where id=any($1::uuid[])', [[owner, other, buyer, actor].filter(Boolean)])
    await db.end()
  }
})
it('loads the masked-to-the-public data in the admin area through the actual REST relationships', async () => {
  const api = serviceSupabase()
  expect((await loadMember(api, owner)).member?.slug).toBe(slug)
  expect((await loadUser(api, buyer, true))?.referrer).toBe(slug)
  expect((await referred(api, owner)).items.map((r) => r.id)).toEqual([buyer])
  expect(await findUser(api, actor, 't2-' + buyer + '@example.test')).toMatchObject({ user_id: buyer, slug })
  expect((await overview(api, actor)).flagged).toBeGreaterThan(0)
  const actual = await payouts(api, { tab: 'payouts', affiliate: owner }, true)
  expect(actual.items[0].owner?.risks).toEqual([{ id: flaggedId, flags: ['same_ip'] }])
  const flagged = await commissions(api, { tab: 'commissions', affiliate: owner, flag: 'yes' })
  expect(flagged.items.map((r) => r.id)).toEqual([flaggedId])
})
it('exports only the selected affiliate and protects payout text from CSV formula interpretation', async () => {
  const api = serviceSupabase()
  const csv = await (await exportCsv(api, { tab: 'commissions', affiliate: owner })).text()
  expect(csv).toContain(owner)
  expect(csv).not.toContain(other)
  expect(csv).toContain('3.73')
  const payout = await (await exportCsv(api, { tab: 'payouts', affiliate: owner })).text()
  expect(payout).toContain("'=sensitive-test-formula()")
  const future = await (await exportCsv(api, { tab: 'commissions', affiliate: owner, from: '2099-01-01' })).text()
  expect(future.trim().split('\r\n')).toHaveLength(1)
})
it('streams the entire filtered export when the payout list exceeds one page', async () => {
  await db.query(
    `insert into affiliate_payouts(affiliate_user_id,period,amount,status,payout_snapshot)
       select $1, date '2010-01-01' + n, 20000, 'paid', '{}' from generate_series(0,30) n`,
    [other],
  )
  const csv = await (await exportCsv(serviceSupabase(), { tab: 'payouts', affiliate: other })).text()
  const ids = csv
    .trim()
    .split('\r\n')
    .slice(1)
    .map((line) => line.split(',')[0])
  expect(ids).toHaveLength(31)
  expect(new Set(ids).size).toBe(31)
  expect(csv).not.toContain(owner)
})
