import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'

let db: Client
let buyer: string
let order: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query(`insert into public.system_settings(key,value) values('pricing_catalog_version','"v2"')
    on conflict(key) do update set value=excluded.value`)
  buyer = await createUser(db)
  order = randomUUID()
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function pay(period: number, charged: number | null, subtotal: number | null, currency: string | null = 'usd', payment = `PAY_${period}`) {
  const { rows } = await db.query("select public.settle_waffo_renewal_v2($1,'starter_yearly',$2,$3,$4,19104,$5,100,$6,$7) as result",
    [buyer, order, period, payment, charged, subtotal, currency])
  return rows[0].result
}

it('settles exactly once in v2 units even when the same period arrives with another payment ID', async () => {
  expect(await pay(2, 19204, 19104)).toEqual({ outcome: 'applied' })
  expect(await pay(2, 19204, 19104)).toEqual({ outcome: 'replayed' })
  expect(await pay(2, 19204, 19104, 'usd', 'another')).toEqual({ outcome: 'replayed' })
  expect((await profileOf(db, buyer)).credits).toBe(23880)
  expect(await ledgerOf(db, buyer)).toHaveLength(1)
})

it.each([[19200, 19100, 'usd'], [19204, 19100, 'usd'], [19204, 19104, 'eur'], [null, 19104, null]] as const)(
  'persists one actionable ticket for an unverifiable charge %s/%s/%s, even on corrected replay', async (charged, subtotal, currency) => {
    const prior = await profileOf(db, buyer)
    const first = await pay(2, charged, subtotal, currency)
    expect(first).toEqual({ outcome: 'review', ticket_id: expect.any(String) })
    expect(await pay(2, 19204, 19104)).toEqual({ outcome: 'review' })
    expect(await profileOf(db, buyer)).toEqual(prior)
    expect(await ledgerOf(db, buyer)).toHaveLength(0)
    const tickets = await db.query(`select status, type, body from public.support_tickets t
      join public.support_ticket_messages m on m.ticket_id=t.id where t.user_id=$1`, [buyer])
    expect(tickets.rows).toEqual([{ status: 'open', type: 'billing', body: expect.stringContaining('PAY_2') }])
    expect(await pay(3, 19204, 19104)).toEqual({ outcome: 'applied' })
  })
