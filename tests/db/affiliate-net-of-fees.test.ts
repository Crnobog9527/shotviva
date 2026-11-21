import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { commissionCents, feeAwareCommissionCents, netBaseCents } from '@/core/affiliate/compute'
import { invite } from '../t94-config'
import { available, bind, dispute, promoter, refund, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// F5 (ARCHITECTURE §6.2 联盟返佣 · 佣金扣手续费, migration 1740): commissions on payments with fee
// data are computed after that payment's processing fees; older payments keep the old formula.
// Each test runs in a transaction that is rolled back.

let db: Client
let f: Awaited<ReturnType<typeof setupAffiliate>>
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  f = await setupAffiliate(db)
  await db.query("update payment_fee_settings set record_from='2000-01-01'")
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

const record = async (input: Record<string, unknown>) => (await row(db, 'select payment_fee_record($1) as r', [input])).r
// The charge's fees as an estimate (F3 at payment time) or the real bill (F3/F4).
const estimate = (payment: string, cents: number, key = `estimate:${payment}:${cents}`) =>
  record({ payment_id: payment, idempotency_key: key, lines: [{ kind: 'acquiring', source: 'estimate', amount_cents: cents }] })
const real = (payment: string, cents: number, key = `stripe_bt:${payment}:${cents}`) =>
  record({ payment_id: payment, idempotency_key: key, actual_cents: cents, lines: [{ kind: 'acquiring', source: 'stripe_bt' }] })
const refundFee = (payment: string, refundId: string, cents: number, status = 'estimated') =>
  record({ payment_id: payment, idempotency_key: `refund_fee:${refundId}:${status}`, refund_id: refundId,
    lines: [{ kind: 'refund_fee', source: status === 'final' ? 'formula' : 'estimate', status, amount_cents: cents }] })
const commission = (payment: string, level = 1) => row(db,
  `select amount::int,status,void_reason,rate_bp,base_usd::int,fee_cents::int,net_base_usd::int
     from affiliate_commissions where payment_id=$1 and level=$2`, [payment, level])
const lastReason = async (payment: string, level = 1) => (await row(db,
  `select h.reason from affiliate_commission_changes h join affiliate_commissions c on c.id=h.commission_id
    where c.payment_id=$1 and c.level=$2 order by h.id desc limit 1`, [payment, level])).reason as string
const daily = (daysAhead: number) => db.query('select affiliate_daily(current_date+$1::int)', [daysAhead])

it('keeps the exact old formula for payments before record_from, and while it is unset', async () => {
  await db.query("update payment_fee_settings set record_from=now()+interval '1 day'")
  await db.query('update affiliate_settings set hold_days=0')
  const p = await sale(db, f.buyer, 'pro_monthly', 5489, 499)
  expect(await commission(p.id)).toEqual({ amount: commissionCents(5489, 499, 0, 1500), status: 'confirmed',
    void_reason: null, rate_bp: 1500, base_usd: 4990, fee_cents: null, net_base_usd: null })
  expect(await estimate(p.id, 300)).toMatchObject({ applied: false, reason: 'legacy' })
  await refund(db, p.charge, 1000)
  expect(await commission(p.id)).toMatchObject({ amount: commissionCents(5489, 499, 1000, 1500), fee_cents: null, net_base_usd: null })

  await db.query('update payment_fee_settings set record_from=null')
  const q = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(q.id)).toMatchObject({ amount: 373, status: 'confirmed', fee_cents: null })
})

it('computes new payments net of their fees, recomputing when the estimate becomes the real bill', async () => {
  const p = await sale(db, f.buyer, 'max_monthly', 9900)
  // The payment row lands before its fees: provisional amount on the old formula, never confirmed.
  expect(await commission(p.id)).toMatchObject({ amount: 1485, status: 'pending', fee_cents: null, net_base_usd: null })
  expect(await estimate(p.id, 400)).toMatchObject({ applied: true, fee_cents: 400, fee_status: 'estimated' })
  expect(await commission(p.id)).toMatchObject({ amount: 1425, base_usd: 9900, fee_cents: 400, net_base_usd: 9500 })
  expect(await lastReason(p.id)).toBe('fee_adjusted')
  expect(await real(p.id, 420)).toMatchObject({ applied: true, fee_status: 'final' })
  expect(await commission(p.id)).toMatchObject({ amount: feeAwareCommissionCents(9900, 0, 0, 1500, 420), fee_cents: 420, net_base_usd: 9480 })
  expect((await commission(p.id)).amount).toBe(1422)
  expect(await lastReason(p.id)).toBe('fee_final')
  // A replayed fee write changes nothing.
  const changes = await row(db, 'select count(*)::int n from affiliate_commission_changes')
  expect(await real(p.id, 420)).toMatchObject({ applied: false, reason: 'replayed' })
  expect(await row(db, 'select count(*)::int n from affiliate_commission_changes')).toEqual(changes)
  // Tax comes off first, as before.
  const taxed = await sale(db, f.buyer, 'pro_monthly', 5489, 499)
  await real(taxed.id, 200)
  expect(await commission(taxed.id)).toMatchObject({ base_usd: 4990, net_base_usd: 4790, amount: 718 })
})

it('confirms after the hold only once fees are final; an estimate confirms after the grace period', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const p = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(p.id)).toMatchObject({ status: 'pending' })
  await estimate(p.id, 102)
  await daily(0)
  expect(await commission(p.id)).toMatchObject({ status: 'pending', amount: 358 })
  // Same cents, now final: the recompute confirms it.
  await real(p.id, 102)
  expect(await commission(p.id)).toMatchObject({ status: 'confirmed', amount: 358 })
  expect(await lastReason(p.id)).toBe('confirmed')

  const q = await sale(db, f.buyer, 'pack_m', 2490)
  await estimate(q.id, 102)
  await daily(5)
  expect(await commission(q.id)).toMatchObject({ status: 'pending' })
  await daily(15) // the default grace is 14 days after confirm_after
  expect(await commission(q.id)).toMatchObject({ status: 'confirmed', amount: 358 })
  expect(await lastReason(q.id)).toBe('confirmed_fee_estimate')
  // F4 settles it later at a different figure: the confirmed commission follows, like a refund.
  await real(q.id, 110)
  expect(await commission(q.id)).toMatchObject({ status: 'confirmed', amount: 357, fee_cents: 110 })
  expect(await lastReason(q.id)).toBe('fee_final')

  // With no grace a pending estimate confirms on the next recompute.
  const r = await sale(db, f.buyer, 'pack_m', 2490)
  await estimate(r.id, 102)
  await db.query('update affiliate_settings set fee_final_grace_days=0')
  expect(await commission(r.id)).toMatchObject({ status: 'pending' })
  await refund(db, r.charge, 100)
  expect(await commission(r.id)).toMatchObject({ status: 'confirmed', fee_cents: 102 })
  expect(await lastReason(r.id)).toBe('confirmed_fee_estimate')
})

it('confirms a fee-era payment with no fee data after the grace period on the published acquiring rate, and alerts until fees arrive', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const alert = (payment: string) => row(db, 'select kind,fee_cents,resolved_at is null as open from affiliate_fee_alerts where payment_id=$1', [payment])
  const p = await sale(db, f.buyer, 'pack_m', 2490)
  await daily(0)
  expect(await commission(p.id)).toMatchObject({ status: 'pending', fee_cents: null })
  expect(await alert(p.id)).toBeUndefined()
  // The daily run picks it up once the grace period is over (recomputes use the clock: shorten it).
  await db.query('update affiliate_settings set fee_final_grace_days=0')
  await daily(0)
  // Stripe card acquiring 2.9% + $0.30 on $24.90 = 102 cents.
  expect(await commission(p.id)).toMatchObject({ status: 'confirmed', fee_cents: 102, net_base_usd: 2388, amount: 358 })
  expect(await lastReason(p.id)).toBe('confirmed_fee_estimate')
  expect(await alert(p.id)).toEqual({ kind: 'fees_missing', fee_cents: 102, open: true })
  // It does not block payouts: no open recompute error.
  expect(await row(db, 'select count(*)::int n from affiliate_recompute_errors where payment_id=$1 and resolved_at is null', [p.id])).toEqual({ n: 0 })
  await daily(1)
  expect(await alert(p.id)).toEqual({ kind: 'fees_missing', fee_cents: 102, open: true })
  // F4 backfills the real fee: the commission follows and the alert closes.
  await real(p.id, 110)
  expect(await commission(p.id)).toMatchObject({ status: 'confirmed', fee_cents: 110, amount: 357 })
  expect(await lastReason(p.id)).toBe('fee_final')
  expect(await alert(p.id)).toMatchObject({ open: false })
  // A legacy payment never takes the fallback.
  await db.query("update payment_fee_settings set record_from=now()+interval '1 day'")
  const old = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(old.id)).toMatchObject({ status: 'confirmed', amount: 373, fee_cents: null })
  expect(await alert(old.id)).toBeUndefined()
})

it('partial refunds deduct the original fee in full from the unrefunded part, floor 0; refund fees count on that payment', async () => {
  const p = await sale(db, f.buyer, 'max_monthly', 9900)
  await real(p.id, 420)
  await refund(db, p.charge, 4950)
  expect(netBaseCents(9900, 0, 4950, 420)).toBe(4530)
  expect(await commission(p.id)).toMatchObject({ net_base_usd: 4530, amount: 679, fee_cents: 420 })
  expect(await lastReason(p.id)).toBe('partial_refund')
  await refundFee(p.id, 're_1', 100)
  expect(await commission(p.id)).toMatchObject({ net_base_usd: 4430, amount: 664, fee_cents: 520 })
  expect(await lastReason(p.id)).toBe('fee_adjusted')
  // Fees above what is left: base 0, commission void, never negative.
  await refund(db, p.charge, 9500)
  expect(await commission(p.id)).toMatchObject({ net_base_usd: 0, amount: 0, status: 'void', void_reason: 'zero' })
  // A full refund voids as today.
  const q = await sale(db, f.buyer, 'pack_m', 2490)
  await real(q.id, 102)
  await refund(db, q.charge, 2490)
  expect(await commission(q.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'refunded', net_base_usd: 0 })
})

it('keeps a confirmed commission confirmed when a refund-fee estimate reopens the fee status; the balance follows', async () => {
  await db.query('update affiliate_settings set hold_days=0')
  const p = await sale(db, f.buyer, 'max_monthly', 9900)
  await real(p.id, 420)
  expect(await commission(p.id)).toMatchObject({ status: 'confirmed', amount: 1422 })
  expect(await available(db, f.owner.id)).toBe(1422)
  await refund(db, p.charge, 4950)
  await refundFee(p.id, 're_2', 100)
  expect(await row(db, 'select fee_status from payments where id=$1', [p.id])).toEqual({ fee_status: 'estimated' })
  expect(await commission(p.id)).toMatchObject({ status: 'confirmed', amount: 664 })
  expect(await available(db, f.owner.id)).toBe(664)
})

it('holds on a dispute and voids when it is lost, net of fees as well', async () => {
  const p = await sale(db, f.buyer, 'max_monthly', 9900)
  await real(p.id, 420)
  const d = await dispute(db, p.charge, 9900)
  expect(await commission(p.id)).toMatchObject({ status: 'on_hold', amount: 1422 })
  await db.query("select close_payment_dispute($1,'lost')", [d])
  expect(await commission(p.id)).toMatchObject({ status: 'void', amount: 0, void_reason: 'dispute_lost' })
  await real(p.id, 430)
  expect(await commission(p.id)).toMatchObject({ status: 'void', amount: 0, void_reason: 'dispute_lost', fee_cents: 430 })
})

it('uses the same net base for the personal team bonus', async () => {
  const grand = await promoter(db)
  await db.query('update affiliates set team_enabled=true where user_id=$1', [grand.id])
  await db.query('update affiliates set team_enabled=true,parent_user_id=$2 where user_id=$1', [f.owner.id, grand.id])
  const member = await promoter(db, f.owner.id)
  const customer = await createUser(db)
  await bind(db, customer, member.slug)
  const p = await sale(db, customer, 'max_yearly', 71300)
  await real(p.id, 2000)
  expect(await commission(p.id)).toMatchObject({ net_base_usd: 69300, amount: 6930 })
  expect(await commission(p.id, 2)).toMatchObject({ net_base_usd: 69300, amount: feeAwareCommissionCents(71300, 0, 0, 300, 2000) })
  expect((await commission(p.id, 2)).amount).toBe(2079)
  expect(await lastReason(p.id, 2)).toBe('fee_final')
})

it('uses the same net base for enterprise level 1 and level 2, and keeps the org-member void', async () => {
  const owner = await createUser(db)
  const input = { owner_user_id: owner, name: 'Org ' + owner.slice(0, 8), affiliate_enabled: true, affiliate_levels: 2 }
  const orgId = (await row(db, 'select admin_org_create($1,$2) as id', [f.actor, input])).id as string
  const join = async (user: string) => {
    const { invite_token } = await row(db, 'select invite_token from orgs where id=$1', [orgId])
    await db.query('select org_join($1,$2)', [user, invite_token])
  }
  const invited = async (inviter: string) => {
    const customer = await createUser(db)
    await db.query("select grant_credits($1::uuid,6,'signup',$2,'free')", [customer, 'signup:' + customer])
    const { code } = await row(db, 'select get_or_create_invite_code($1) as code', [inviter])
    await db.query("select redeem_code($1,$2,'signup',null,$3)", [customer, code, invite.windowDays])
    return customer
  }
  const staff = await createUser(db)
  await join(staff)
  const a = await invited(staff)
  const b = await invited(a)

  const l1 = await sale(db, a, 'pro_yearly', 47900)
  await real(l1.id, 1919)
  expect(await commission(l1.id)).toMatchObject({ rate_bp: 1000, net_base_usd: 45981, amount: 4598 })
  const l2 = await sale(db, b, 'pack_m', 2490)
  await estimate(l2.id, 102)
  expect(await commission(l2.id)).toMatchObject({ rate_bp: 500, net_base_usd: 2388, amount: 119 })
  expect(await commission(l2.id, 2)).toBeUndefined()

  await join(b)
  const member = await sale(db, b, 'pack_m', 2490)
  await estimate(member.id, 102)
  expect(await commission(member.id)).toMatchObject({ amount: 0, status: 'void', void_reason: 'org_member', fee_cents: 102 })
})

it('never lets a commission problem undo the fee write', async () => {
  const p = await sale(db, f.buyer, 'pack_m', 2490)
  await db.query("update payments set currency='eur' where id=$1", [p.id])
  expect(await estimate(p.id, 102)).toMatchObject({ applied: true, fee_cents: 102 })
  expect(await row(db, 'select fee_cents from payments where id=$1', [p.id])).toEqual({ fee_cents: 102 })
  expect(await row(db, 'select error from affiliate_recompute_errors where payment_id=$1 and resolved_at is null', [p.id]))
    .toMatchObject({ error: expect.stringContaining('AFFILIATE_NON_USD_PAYMENT') })
})

it('keeps the internal functions and the alert table private', async () => {
  expect(await row(db, `select has_table_privilege('anon','affiliate_fee_alerts','select') a,
    has_table_privilege('authenticated','affiliate_fee_alerts','select') u,has_table_privilege('service_role','affiliate_fee_alerts','select') s,
    has_table_privilege('service_role','affiliate_fee_alerts','insert') i`)).toEqual({ a: false, u: false, s: true, i: false })
  for (const fn of ['_affiliate_due(integer,integer,integer,integer,integer)', '_affiliate_net_base(integer,integer,integer,integer)',
    '_affiliate_fee_era(payments)', '_affiliate_fee_ready(payments,timestamptz,timestamptz)', '_affiliate_fee_fallback(payments)',
    '_affiliate_fee_missing(payments)']) {
    expect(await row(db, `select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') u,
      has_function_privilege('service_role',$1,'execute') s`, [fn])).toEqual({ a: false, u: false, s: false })
  }
})
