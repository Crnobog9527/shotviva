import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { commission, dispute, row, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, ledgerOf, profileOf } from './helpers'

let db: Client
let buyer: string
let charge: string
let session: string
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  buyer = (await setupAffiliate(db)).buyer
  charge = 'ch_' + randomUUID()
  session = 'cs_' + randomUUID()
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

async function checkout(chargeId: string | null = charge) {
  await db.query("select settle_checkout($1,'pack_s',$2,1040,'usd',50,'card',null,$3)", [buyer, session, chargeId])
  return (await row(db, 'select id from payments where stripe_session_id=$1', [session])).id as string
}

function readDispute(id: string) {
  return row(db, 'select * from payment_disputes where stripe_dispute_id=$1', [id])
}

async function checkOpen(id: string, payment: string) {
  expect(await readDispute(id)).toMatchObject({
    payment_id: payment, user_id: buyer, closed_at: null, credits_clawed_back: 20, clawback_shortfall: 0,
  })
  expect((await profileOf(db, buyer)).credits).toBe(0)
  expect((await ledgerOf(db, buyer)).filter(l => l.kind === 'clawback')).toMatchObject([
    { delta: -20, idempotency_key: 'clawback:' + payment + ':dispute:' + id },
  ])
  expect(await commission(db, payment)).toMatchObject({ status: 'on_hold', amount: 148, flags: [] })
}

it.each(['insert', 'charge update', 'payment first'])('links exactly once and freezes the commission on %s', async (order) => {
  const paymentFirst = order === 'payment first'
  let payment = paymentFirst ? await checkout() : ''
  const id = await dispute(db, charge, 1040)
  if (!paymentFirst) {
    expect((await readDispute(id)).payment_id).toBeNull()
    payment = await checkout(order === 'insert' ? charge : null)
  }
  await db.query('update payments set stripe_charge_id=$1 where id=$2', [charge, payment])
  await checkOpen(id, payment)
  await db.query("select open_payment_dispute($1,$2,1040,'usd','fraudulent',now(),false)", [id, charge])
  await checkout()
  await checkOpen(id, payment)
  await db.query("select close_payment_dispute($1,'lost')", [id])
  expect(await commission(db, payment)).toMatchObject({ status: 'void', amount: 0, void_reason: 'dispute_lost' })
})

it('commits the purchase and grant and logs one error if the repair fails', async () => {
  const id = await dispute(db, charge, 1040)
  // Inject an inconsistent close on this fixture only. The T71 close RPC rejects
  // the missing outcome after association and debit, exercising their rollback.
  await db.query('update payment_disputes set closed_at=now() where stripe_dispute_id=$1', [id])
  const payment = await checkout()
  await db.query('update affiliate_settings set enabled=false')
  await db.query('commit')
  expect(await readDispute(id)).toMatchObject({ payment_id: null, user_id: null, credits_clawed_back: 0 })
  expect(await row(db, 'select status from payments where id=$1', [payment])).toEqual({ status: 'paid' })
  expect((await profileOf(db, buyer)).credits).toBe(20)
  expect((await ledgerOf(db, buyer)).map(l => l.kind)).toEqual(['purchase'])
  expect((await db.query('select error_code from payment_dispute_link_errors where payment_id=$1', [payment])).rows)
    .toEqual([{ error_code: 'P0001' }])
})

it.each(['won', 'warning_closed'])('honors an earlier %s close and preserves the original close time', async (status) => {
  const id = await dispute(db, charge, 1040)
  await db.query('select close_payment_dispute($1,$2)', [id, status])
  await db.query("update payment_disputes set closed_at='2026-03-01T12:00Z' where stripe_dispute_id=$1", [id])
  const original = await readDispute(id)
  const payment = await checkout()
  await db.query('select close_payment_dispute($1,$2)', [id, status])
  expect(await readDispute(id)).toMatchObject({
    payment_id: payment, closed_status: status, closed_at: original.closed_at, credits_restored: 20,
  })
  expect((await ledgerOf(db, buyer)).map(l => l.delta)).toEqual([20, -20, 20])
  expect((await profileOf(db, buyer)).credits).toBe(20)
  expect(await commission(db, payment)).toMatchObject({ amount: 148, status: 'pending' })
})

it('matches the normal-order lost settlement even when the bank closed before checkout', async () => {
  const lost = async (id: string) => db.query("select close_payment_dispute($1,'lost')", [id])
  const accounts = async (id: string, payment: string) => {
    const d = await readDispute(id)
    return { taken: d.credits_clawed_back, restored: d.credits_restored, closed: d.closed_status,
      balance: (await profileOf(db, buyer)).credits, ledger: (await ledgerOf(db, buyer)).map(l => l.delta),
      payment: await row(db, 'select status,credits_clawed_back,clawback_shortfall from payments where id=$1', [payment]) }
  }
  const regular = await checkout()
  const baseline = await dispute(db, charge, 1040)
  await lost(baseline)
  const expected = await accounts(baseline, regular)

  buyer = (await setupAffiliate(db)).buyer
  charge = 'ch_' + randomUUID()
  session = 'cs_' + randomUUID()
  const early = await dispute(db, charge, 1040)
  await lost(early)
  const payment = await checkout()
  await lost(early)
  expect(await accounts(early, payment)).toEqual(expected)
  expect(await commission(db, payment)).toMatchObject({ status: 'void', amount: 0, void_reason: 'dispute_lost' })
})

it('settles overlapping inquiry and chargeback once for the same charge', async () => {
  const inquiry = await dispute(db, charge, 1040)
  const escalated = await dispute(db, charge, 1040)
  await db.query("select close_payment_dispute($1,'warning_closed')", [inquiry])
  const payment = await checkout()
  expect((await readDispute(inquiry)).credits_restored).toBe(0)
  expect((await readDispute(escalated)).credits_clawed_back).toBe(20)
  expect((await ledgerOf(db, buyer)).map(l => l.delta)).toEqual([20, -20])
  expect(await commission(db, payment)).toMatchObject({ status: 'on_hold', amount: 148 })
  await db.query("select close_payment_dispute($1,'won')", [escalated])
  expect((await ledgerOf(db, buyer)).map(l => l.delta)).toEqual([20, -20, 20])
})
