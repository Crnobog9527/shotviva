import type { Client } from 'pg'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { available, commission, promoter, refund, row, sale } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

let refunds: Client
let payouts: Client
const users: string[] = []
beforeAll(async () => { [refunds, payouts] = await Promise.all([connectAdmin(), connectAdmin()]) })
afterAll(async () => {
  try {
    await refunds.query('rollback')
    await refunds.query('delete from auth.users where id=any($1::uuid[])', [users])
  } finally {
    await Promise.all([refunds.end(), payouts.end()])
  }
})

// Seed only this affiliate's issued payout. No global settings or scheduler run are needed.
async function issuedPayout() {
  await refunds.query('begin')
  const actor = await createUser(refunds)
  const buyer = await createUser(refunds)
  const owner = await promoter(refunds)
  users.push(actor, buyer, owner.id)
  await refunds.query("update profiles set role='admin' where id=$1", [actor])
  const payment = await sale(refunds, buyer, 'pack_m', 2000)
  const item = await row(refunds, `insert into affiliate_commissions
    (affiliate_user_id,payment_id,level,product_id,rate_bp,base_usd,amount,status,confirmed_at,confirm_after)
    values ($1,$2,1,'pack_m',1500,2000,300,'confirmed',now(),now()) returning id`, [owner.id, payment.id])
  const payout = await row(refunds, `insert into affiliate_payouts (affiliate_user_id,period,amount,payout_snapshot)
    values ($1,current_date,300,'{"payout_method":"wise"}') returning id`, [owner.id])
  await refunds.query('insert into affiliate_payout_items (payout_id,commission_id,prior_amount,issue_amount) values ($1,$2,0,300)', [payout.id, item.id])
  await refunds.query('commit')
  return { actor, payment, owner, id: payout.id }
}

function review(id: string) {
  return row(payouts, `select status,paid_amount::int,affiliate_payout_payable(p)::int as payable
    from affiliate_payouts p where id=$1`, [id])
}

it('waits for an uncommitted refund before accepting the reviewed payout amount', async () => {
  const f = await issuedPayout()
  const { pid } = await row(payouts, 'select pg_backend_pid() as pid')
  const pay = (expected: number) => payouts.query('select admin_affiliate_payout_decide($1,$2)', [f.actor, {
    payout_id: f.id, status: 'paid', paid_at: '2031-01-02', method: 'wise', paid_reference: 'concurrent-test', expected_amount: expected,
  }])
  const before = await review(f.id)
  expect(before).toEqual({ status: 'due', paid_amount: null, payable: 300 })

  await refunds.query('begin')
  await refund(refunds, f.payment.charge, 1000)
  expect(await commission(refunds, f.payment.id)).toMatchObject({ status: 'confirmed', amount: 150 })
  const attempted = pay(before.payable).then(() => null, (error: Error) => error.message)
  try {
    await vi.waitFor(async () => {
      const { blocked } = await row(refunds, 'select pg_backend_pid()=any(pg_blocking_pids($1)) as blocked', [pid])
      expect(blocked).toBe(true)
    }, { timeout: 5000 })
  } finally {
    await refunds.query('commit')
  }
  expect(await attempted).toBe('AFFILIATE_PAYOUT_AMOUNT_CHANGED')
  const refreshed = await review(f.id)
  expect(refreshed).toEqual({ status: 'due', paid_amount: null, payable: 150 })
  await pay(refreshed.payable)
  expect(await review(f.id)).toEqual({ status: 'paid', paid_amount: 150, payable: null })
  expect(await available(payouts, f.owner.id)).toBe(0)
}, 15000)
