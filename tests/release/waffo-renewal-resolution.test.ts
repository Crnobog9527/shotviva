import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

import { createUser, ledgerOf, profileOf } from '../db/helpers'
import { cloneLocalPricingDb } from './local-pricing-clone'

let db: Client
let clone: ReturnType<typeof cloneLocalPricingDb>
let actor: string
let buyer: string
let order: string
beforeAll(async () => {
  clone = cloneLocalPricingDb()
  db = await clone.connect()
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  actor = await createUser(db)
  await db.query("update public.profiles set role='admin' where id=$1", [actor])
}, 30000)
beforeEach(async () => {
  buyer = await createUser(db)
  order = randomUUID()
})
afterAll(async () => {
  try { await db?.end() } finally { clone?.drop() }
})

async function webhook(payment = order, total: number | null = null) {
  const { rows } = await db.query("select public.settle_waffo_renewal_v2($1,'starter_yearly',$2,2,$3,19104,$4,100,null,'usd') as result",
    [buyer, order, payment, total])
  return rows[0].result
}
function decide(ticket: string, decision: 'settled' | 'refunded', client = db, by = actor) {
  return client.query('select public.admin_resolve_waffo_renewal($1,$2,$3,$4,$5)',
    [by, ticket, decision, decision === 'settled' ? 19200 : null, decision === 'settled' ? 100 : null])
}
async function audits(ticket: string) {
  return (await db.query('select action,user_id,reason::jsonb as reason from public.admin_audit_log where target_id=$1', [ticket])).rows
}
async function review(ticket: string) {
  return (await db.query('select public.admin_waffo_renewal_review($1) as review', [ticket])).rows[0].review
}

it('settles the verified receipt, v2 credits and expiry together, then closes and audits once', async () => {
  const { ticket_id } = await webhook()
  expect(await review(ticket_id)).toMatchObject({ charged: null, period_paid: false, resolution: null })
  await expect(decide(ticket_id, 'settled', db, buyer)).rejects.toThrow('FORBIDDEN')
  await expect(db.query("select public.admin_resolve_waffo_renewal($1,$2,'settled',0,0)", [actor, ticket_id])).rejects.toThrow('INVALID_INPUT')
  await decide(ticket_id, 'settled')
  const profile = await profileOf(db, buyer)
  expect(profile.credits).toBe(23880)
  expect(profile.paid_until!.getTime()).toBeGreaterThan(Date.now())
  await decide(ticket_id, 'settled')
  await expect(decide(ticket_id, 'refunded')).rejects.toThrow('CONFLICT')
  expect(await webhook(order, 19204)).toEqual({ outcome: 'review' })
  expect(await profileOf(db, buyer)).toEqual(profile)
  expect(await ledgerOf(db, buyer)).toHaveLength(1)
  expect(await review(ticket_id)).toMatchObject({ period_paid: true, resolution: 'settled' })
  const { rows } = await db.query(`select p.amount_total,p.amount_tax,t.status,r.ticket_id from public.payments p
    join public.support_tickets t on t.payment_id=p.id join admin.waffo_renewal_periods r on r.resolved_ticket_id=t.id
    where p.waffo_payment_id=$1`, [order])
  expect(rows).toEqual([{ amount_total: 19200, amount_tax: 100, status: 'closed', ticket_id: null }])
  expect(await audits(ticket_id)).toEqual([{action: 'waffo_renewal_settled', user_id: buyer, reason: expect.objectContaining({ actor, payment: order })}])
  expect((await db.query('select body from public.support_ticket_messages where ticket_id=$1', [ticket_id])).rows)
    .toContainEqual({body: expect.stringMatching(/积分已到账.*\nWe’ve verified/)})
})

it('records an external refund once while keeping credits, expiry and revenue untouched', async () => {
  const prior = await profileOf(db, buyer)
  const { ticket_id } = await webhook()
  await decide(ticket_id, 'refunded')
  await decide(ticket_id, 'refunded')
  await expect(decide(ticket_id, 'settled')).rejects.toThrow('CONFLICT')
  expect(await webhook(order, 19204)).toEqual({ outcome: 'review' })
  expect(await profileOf(db, buyer)).toEqual(prior)
  expect(await ledgerOf(db, buyer)).toHaveLength(0)
  expect((await db.query('select id from public.payments where user_id=$1', [buyer])).rows).toHaveLength(0)
  expect((await db.query('select status from public.support_tickets where id=$1', [ticket_id])).rows[0].status).toBe('closed')
  expect((await db.query('select ticket_id from admin.waffo_renewal_periods where resolved_ticket_id=$1', [ticket_id])).rows[0].ticket_id).toBeNull()
  expect(await review(ticket_id)).toMatchObject({ period_paid: false, resolution: 'refunded' })
  expect(await audits(ticket_id)).toEqual([{ action: 'waffo_renewal_refunded', user_id: buyer, reason: expect.objectContaining({ actor, payment: order }) }])
})

it('serializes two operators settling different tickets from the same period', async () => {
  const tickets = [await webhook(), await webhook(randomUUID(), 19204)]
  const parallel = await clone.connect()
  try {
    const outcomes = await Promise.allSettled(tickets.map((t,i) => decide(t.ticket_id, 'settled', i ? parallel : db)))
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const loser = tickets[outcomes.findIndex(r => r.status === 'rejected')].ticket_id
    expect(await review(loser)).toMatchObject({ period_paid: true, resolution: null })
    await expect(decide(loser, 'settled')).rejects.toThrow('CONFLICT')
    await decide(loser, 'refunded')
    expect(await ledgerOf(db, buyer)).toHaveLength(1)
  } finally { await parallel.end() }
})

it('recognizes a receipt settled by the old deployment even when its replay lacks amounts', async () => {
  await db.query("select public.settle_waffo_order_v2($1,'starter_yearly',$2,$2,19204,'usd',100,'card')", [buyer, order])
  const prior = await profileOf(db, buyer)
  expect(await webhook()).toEqual({ outcome: 'replayed' })
  expect(await webhook()).toEqual({ outcome: 'replayed' })
  expect((await db.query('select id from public.support_tickets where user_id=$1', [buyer])).rows).toHaveLength(0)
  const duplicate = await webhook(randomUUID(), 19204)
  await expect(decide(duplicate.ticket_id, 'settled')).rejects.toThrow('CONFLICT')
  expect(await profileOf(db, buyer)).toEqual(prior)
  expect(await ledgerOf(db, buyer)).toHaveLength(1)
})

it.each(['admin_waffo_renewal_review(uuid)', 'admin_resolve_waffo_renewal(uuid,uuid,text,integer,integer)'])(
  'restricts %s to service_role', async fn => {
    const { rows } = await db.query(`select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') member,has_function_privilege('service_role',$1,'execute') service`, ['public.'+fn])
    expect(rows[0]).toEqual({ anon:false, member:false, service:true })
  })
