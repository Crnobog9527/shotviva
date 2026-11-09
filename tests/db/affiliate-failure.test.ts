import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { commission, dispute, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, ledgerOf, profileOf } from './helpers'

let db: Client
let reader: Client
beforeAll(async () => { db = await connectAdmin(); reader = await connectAdmin() })
afterAll(async () => { await Promise.all([db.end(), reader.end()]) })

// Make every actual commission write in this transaction fail without touching any billing RPC.
// The test-only constraint and temporary configuration are gone before other sessions see them.
async function injectFailure(work: () => Promise<void>) {
  await db.query("alter table affiliate_commissions add constraint t95_forced_failure check (false) not valid")
  await work()
  await db.query('alter table affiliate_commissions drop constraint t95_forced_failure')
}

async function repair(payment: string) {
  const errors = () => row(reader, 'select count(*)::int as n from affiliate_recompute_errors where payment_id=$1 and resolved_at is null', [payment])
  expect((await errors()).n).toBe(1)
  await db.query('begin')
  await db.query('update affiliate_settings set enabled=true')
  await db.query('select affiliate_daily(current_date)')
  await db.query('update affiliate_settings set enabled=false')
  await db.query('commit')
  expect((await errors()).n).toBe(0)
  expect(await row(reader, 'select resolved_at from affiliate_recompute_errors where payment_id=$1', [payment])).toMatchObject({ resolved_at: expect.any(Date) })
}

async function commitFailure(work: () => Promise<void>) {
  await db.query('begin')
  try {
    await db.query('update affiliate_settings set enabled=true')
    await injectFailure(work)
    await db.query('update affiliate_settings set enabled=false')
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

it('checkout, refund and dispute commit their payment and credit ledger even when commission calculation fails', async () => {
  let buyer = ''
  let p: Awaited<ReturnType<typeof sale>>
  await commitFailure(async () => {
    const fixture = await setupAffiliate(db)
    buyer = fixture.buyer
    p = await sale(db, buyer, 'pack_m', 2490)
  })
  const payment = p!
  expect((await profileOf(reader, buyer)).credits).toBe(55)
  expect(await ledgerOf(reader, buyer)).toEqual(expect.arrayContaining([expect.objectContaining({ delta: 55 })]))
  expect(await commission(reader, payment.id)).toBeUndefined()
  await repair(payment.id)
  expect(await commission(reader, payment.id)).toMatchObject({ amount: 373, status: 'pending' })

  await commitFailure(() => refund(db, payment.charge, 1245))
  expect(await row(reader, 'select status,amount_refunded from payments where id=$1', [payment.id])).toMatchObject({ status: 'partially_refunded', amount_refunded: 1245 })
  expect((await profileOf(reader, buyer)).credits).toBe(28)
  expect(await ledgerOf(reader, buyer)).toEqual(expect.arrayContaining([expect.objectContaining({ delta: -27 })]))
  await repair(payment.id)
  expect(await commission(reader, payment.id)).toMatchObject({ amount: 186 })

  await commitFailure(async () => { await dispute(db, payment.charge, 1245) })
  expect(await row(reader, 'select status from payments where id=$1', [payment.id])).toMatchObject({ status: 'disputed' })
  expect((await profileOf(reader, buyer)).credits).toBe(0)
  expect(await ledgerOf(reader, buyer)).toEqual(expect.arrayContaining([expect.objectContaining({ delta: -28 })]))
  await repair(payment.id)
  expect(await commission(reader, payment.id)).toMatchObject({ amount: 186, status: 'on_hold' })
})
