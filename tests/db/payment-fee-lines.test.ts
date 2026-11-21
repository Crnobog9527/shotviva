import { randomUUID } from 'node:crypto'
import type { Client } from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { commission, row, sale, setupAffiliate } from './affiliate-fixtures'
import { connectAdmin, createUser } from './helpers'

// F2 (ARCHITECTURE §6.2 联盟返佣 · 订单手续费): the fee ledger and the published-rate table.
let db: Client
beforeAll(async () => { db = await connectAdmin() })
beforeEach(async () => {
  await db.query('begin')
  await db.query("update payment_fee_settings set record_from='2000-01-01'")
})
afterEach(async () => { await db.query('rollback') })
afterAll(async () => { await db.end() })

type Line = Record<string, unknown>
const record = async (input: Record<string, unknown>) => (await row(db, 'select payment_fee_record($1) as r', [input])).r
const schedule = async (channel: string, method: string, kind: string) =>
  Number((await row(db, "select (payment_fee_schedule_for($1,$2,$3,now())).id as id", [channel, method, kind])).id)
const fees = (id: string) => row(db, 'select fee_cents,fee_status from payments where id=$1', [id])
const current = async (id: string) =>
  (await db.query('select kind,amount_cents,source,status,revision,refund_id from payment_fee_lines_current($1)', [id])).rows
async function refused(run: () => Promise<unknown>, message: string) {
  await db.query('savepoint refused')
  await expect(run()).rejects.toThrow(message)
  await db.query('rollback to savepoint refused')
}

async function waffoSale(cents: number, method = 'card') {
  const buyer = await createUser(db)
  const uid = randomUUID()
  await db.query("select settle_waffo_order($1,'pack_s',$2,$3,$4,'usd',0,$5)", [buyer, 'PAY_' + uid, 'ORD_' + uid, cents, method])
  return (await row(db, 'select id from payments where waffo_payment_id=$1', ['PAY_' + uid])).id as string
}
async function stripeSale(cents: number, method = 'cn_card') {
  const buyer = await createUser(db)
  const uid = randomUUID()
  await db.query("select settle_checkout($1,'pack_s',$2,$3,'usd',0,$4,null,$5)", [buyer, 'cs_' + uid, cents, method, 'ch_' + uid])
  return (await row(db, 'select id from payments where stripe_session_id=$1', ['cs_' + uid])).id as string
}
async function waffoEstimate(id: string, cents: number) {
  const line: Line = { kind: 'acquiring', source: 'estimate', schedule_id: await schedule('waffo', 'card', 'acquiring') }
  return record({ payment_id: id, idempotency_key: `estimate:${id}`, basis_cents: cents, lines: [line] })
}

it('prices published rates: Waffo rounds up, Stripe rounds half up', async () => {
  const amount = async (basis: number, bp: number, fixed: number, rounding: string) =>
    (await row(db, 'select payment_fee_amount($1,$2,$3,$4) as a', [basis, bp, fixed, rounding])).a
  // F1: the four settled Waffo card amounts and their real fees.
  for (const [basis, fee] of [[990, 89], [1990, 128], [4990, 245], [47904, 1919]]) expect(await amount(basis, 390, 50, 'ceil')).toBe(fee)
  expect(await amount(990, 290, 30, 'half_up') + await amount(990, 150, 0, 'half_up')).toBe(74)
  expect(await amount(0, 390, 50, 'ceil')).toBe(50)
  await refused(async () => amount(-1, 390, 0, 'ceil'), 'INVALID_INPUT')
  await refused(async () => amount(990, 390, 0, 'down'), 'INVALID_INPUT')
})

it('seeds the Owner rates for Waffo and the published Stripe rates', async () => {
  const rate = (channel: string, method: string, kind: string) => row(db,
    'select rate_bp,fixed_cents,rounding from payment_fee_schedule_for($1,$2,$3,now())', [channel, method, kind])
  expect(await rate('waffo', 'card', 'acquiring')).toEqual({ rate_bp: 390, fixed_cents: 50, rounding: 'ceil' })
  expect(await rate('waffo', 'wechat_pay', 'acquiring')).toEqual({ rate_bp: 390, fixed_cents: 0, rounding: 'ceil' })
  expect(await rate('waffo', 'alipay', 'acquiring')).toEqual({ rate_bp: 390, fixed_cents: 0, rounding: 'ceil' })
  expect(await rate('waffo', 'card', 'refund_fee')).toMatchObject({ rate_bp: 0, fixed_cents: 100 })
  expect(await rate('stripe', 'card', 'mp')).toMatchObject({ rate_bp: 350, fixed_cents: 0 })
  expect(await rate('stripe', 'cn_card', 'acquiring')).toMatchObject({ rate_bp: 290, fixed_cents: 30 })
  expect(await rate('stripe', 'cn_card', 'mp')).toEqual({ rate_bp: null, fixed_cents: null, rounding: null })
})

it('leaves legacy payments alone: nothing is written before record_from or while it is unset', async () => {
  const id = await waffoSale(990)
  expect(await fees(id)).toEqual({ fee_cents: null, fee_status: null })
  await db.query('update payment_fee_settings set record_from=null')
  expect(await waffoEstimate(id, 990)).toMatchObject({ applied: false, reason: 'legacy' })
  await db.query("update payment_fee_settings set record_from=now()+interval '1 day'")
  expect(await waffoEstimate(id, 990)).toMatchObject({ applied: false, reason: 'legacy' })
  expect(await row(db, 'select count(*)::int n from payment_fee_lines where payment_id=$1', [id])).toEqual({ n: 0 })
  expect(await fees(id)).toEqual({ fee_cents: null, fee_status: null })
})

it('writes a Waffo estimate, then the settlement as a new final revision; the estimate stays on record', async () => {
  const id = await waffoSale(990)
  expect(await waffoEstimate(id, 990)).toMatchObject({ applied: true, revision: 1, fee_cents: 89, fee_status: 'estimated' })
  const settled = await record({ payment_id: id, idempotency_key: `waffo_settlement:PAY_x`, actual_cents: 90, lines: [
    { kind: 'acquiring', source: 'waffo_settlement', schedule_id: await schedule('waffo', 'card', 'acquiring'), source_ref: 'PAY_x' }] })
  expect(settled).toMatchObject({ applied: true, revision: 2, fee_cents: 90, fee_status: 'final' })
  expect(await current(id)).toEqual([{ kind: 'acquiring', amount_cents: 90, source: 'waffo_settlement', status: 'final', revision: 2, refund_id: null }])
  expect((await db.query('select revision,amount_cents from payment_fee_lines where payment_id=$1 order by id', [id])).rows)
    .toEqual([{ revision: 1, amount_cents: 89 }, { revision: 2, amount_cents: 90 }])
  // A late estimate (e.g. a webhook retry with its own key) never replaces a final revision.
  const late = await record({ payment_id: id, idempotency_key: 'estimate:retry', basis_cents: 990,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await schedule('waffo', 'card', 'acquiring') }] })
  expect(late).toMatchObject({ applied: false, reason: 'final', fee_cents: 90 })
})

it('is idempotent by key: a replay writes nothing, the same key on another payment is refused', async () => {
  const id = await waffoSale(1990)
  await waffoEstimate(id, 1990)
  expect(await waffoEstimate(id, 1990)).toMatchObject({ applied: false, reason: 'replayed', revision: 1, fee_cents: 128 })
  expect(await row(db, 'select count(*)::int n from payment_fee_lines where payment_id=$1', [id])).toEqual({ n: 1 })
  const other = await waffoSale(1990)
  await refused(async () => record({ payment_id: other, idempotency_key: `estimate:${id}`, basis_cents: 1990,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await schedule('waffo', 'card', 'acquiring') }] }), 'PAYMENT_FEE_KEY_CONFLICT')
})

it('splits a real Stripe fee into its items so they add up to the charged fee; acquiring takes the residual', async () => {
  // F1: CN card, ¥72 converted to $10.78; stripe_fee rows: conversion 11 + processing 77 = 88.
  const id = await stripeSale(1078)
  const s = async (kind: string) => schedule('stripe', 'cn_card', kind)
  const bt = (kind: string, extra: Line = {}) => ({ kind, source: 'stripe_bt', schedule_id: 0, source_ref: 'txn_x', ...extra })
  const lines = [{ ...bt('acquiring'), schedule_id: await s('acquiring') }, { ...bt('intl_card'), schedule_id: await s('intl_card') },
    { ...bt('fx', { amount_cents: 11 }), schedule_id: await s('fx') },
    { kind: 'radar', source: 'formula', status: 'estimated', schedule_id: await s('radar') }]
  const out = await record({ payment_id: id, idempotency_key: 'stripe_bt:txn_x', basis_cents: 1078, actual_cents: 88, lines })
  expect(out.lines.map((l: Line) => [l.kind, l.amount_cents])).toEqual([['acquiring', 61], ['intl_card', 16], ['fx', 11], ['radar', 5]])
  expect(out).toMatchObject({ fee_cents: 93, fee_status: 'estimated' })
  // Stripe charged one cent more than the published rates give: the acquiring line absorbs it.
  const odd = await stripeSale(990)
  const odd1 = await record({ payment_id: odd, idempotency_key: 'stripe_bt:txn_y', basis_cents: 990, actual_cents: 75, lines: [
    { kind: 'acquiring', source: 'stripe_bt', schedule_id: await s('acquiring') }, { kind: 'intl_card', source: 'stripe_bt', schedule_id: await s('intl_card') }] })
  expect(odd1.lines.map((l: Line) => l.amount_cents)).toEqual([60, 15])
  expect(odd1).toMatchObject({ fee_cents: 75, fee_status: 'final' })
  const sum = await row(db, 'select sum(amount_cents)::int s from payment_fee_lines where payment_id=$1 and source=$2', [id, 'stripe_bt'])
  expect(sum).toEqual({ s: 88 })
})

it('refuses a set built from a stale revision: a late allocation cannot overwrite the real Stripe fee', async () => {
  const id = await stripeSale(2490, 'card')
  const s = async (kind: string) => schedule('stripe', 'card', kind)
  const mp = { kind: 'mp', source: 'formula', schedule_id: await s('mp') }
  await record({ payment_id: id, idempotency_key: `estimate:${id}`, basis_cents: 2490, expected_revision: 0,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await s('acquiring') }, mp] })
  // F4 reads revision 1 here; meanwhile F3 writes the real fee as revision 2 (it passes no expectation).
  await record({ payment_id: id, idempotency_key: 'stripe_bt:txn_z', basis_cents: 2490, actual_cents: 103,
    lines: [{ kind: 'acquiring', source: 'stripe_bt', schedule_id: await s('acquiring'), source_ref: 'txn_z' }, mp] })
  const batch = { payment_id: id, idempotency_key: `mp_batch:txn_b:${id}`, basis_cents: 2490,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await s('acquiring') }, { ...mp, amount_cents: 87, status: 'final' }] }
  await refused(async () => record({ ...batch, expected_revision: 1 }), 'PAYMENT_FEE_REVISION_CONFLICT')
  expect(await fees(id)).toEqual({ fee_cents: 190, fee_status: 'estimated' })
  // Reread and retry on top of revision 2, carrying its real line forward.
  const retry = await record({ ...batch, expected_revision: 2, actual_cents: 103, lines: [
    { kind: 'acquiring', source: 'stripe_bt', schedule_id: await s('acquiring'), source_ref: 'txn_z' }, { ...mp, amount_cents: 87, status: 'final' }] })
  expect(retry).toMatchObject({ applied: true, revision: 3, fee_cents: 190, fee_status: 'final' })
  expect(await record({ ...batch, expected_revision: 1 })).toMatchObject({ applied: false, reason: 'replayed', revision: 3 })
})

it('lets a final revision be corrected by a set with real lines, even when it carries estimated formula lines', async () => {
  const id = await stripeSale(990)
  const s = async (kind: string) => schedule('stripe', 'cn_card', kind)
  const real = (key: string, actual: number, extra: Line[] = []) => record({ payment_id: id, idempotency_key: key, basis_cents: 990,
    actual_cents: actual, lines: [{ kind: 'acquiring', source: 'stripe_bt', schedule_id: 0 }, ...extra].map((l) =>
      l.kind === 'acquiring' ? { ...l, schedule_id: acq } : l) })
  const acq = await s('acquiring')
  expect(await real('stripe_bt:a', 74)).toMatchObject({ revision: 1, fee_cents: 74, fee_status: 'final' })
  const radar = { kind: 'radar', source: 'formula', schedule_id: await s('radar') }
  expect(await real('stripe_bt:b', 75, [radar])).toMatchObject({ applied: true, revision: 2, fee_cents: 80, fee_status: 'estimated' })
  expect(await record({ payment_id: id, idempotency_key: 'radar-only', basis_cents: 990, lines: [radar] }))
    .toMatchObject({ applied: true, revision: 3 })
  await record({ payment_id: id, idempotency_key: 'stripe_bt:c', basis_cents: 990, actual_cents: 75, lines: [
    { kind: 'acquiring', source: 'stripe_bt', schedule_id: acq }, { ...radar, status: 'final' }] })
  expect(await record({ payment_id: id, idempotency_key: 'radar-late', basis_cents: 990, lines: [radar] }))
    .toMatchObject({ applied: false, reason: 'final', revision: 4 })
})

it('refuses inconsistent sets', async () => {
  const id = await stripeSale(990)
  const acq = await schedule('stripe', 'cn_card', 'acquiring')
  const base = { payment_id: id, idempotency_key: 'bad', basis_cents: 990 }
  await refused(async () => record({ ...base, actual_cents: 10, lines: [{ kind: 'fx', source: 'stripe_bt', amount_cents: 11 },
    { kind: 'acquiring', source: 'stripe_bt', schedule_id: acq }] }), 'PAYMENT_FEE_SPLIT')
  await refused(async () => record({ ...base, actual_cents: 74, lines: [{ kind: 'intl_card', source: 'stripe_bt', schedule_id: await schedule('stripe', 'cn_card', 'intl_card') }] }), 'PAYMENT_FEE_SPLIT')
  await refused(async () => record({ ...base, lines: [{ kind: 'acquiring', source: 'stripe_bt', schedule_id: acq }] }), 'INVALID_INPUT')
  await refused(async () => record({ ...base, lines: [{ kind: 'acquiring', source: 'waffo_settlement', amount_cents: 1 }] }), 'INVALID_INPUT')
  await refused(async () => record({ ...base, lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await schedule('waffo', 'card', 'acquiring') }] }), 'PAYMENT_FEE_SCHEDULE_MISMATCH')
  await refused(async () => record({ ...base, lines: [{ kind: 'acquiring', source: 'estimate', status: 'final', schedule_id: acq }] }), 'INVALID_INPUT')
  await refused(async () => record({ ...base, lines: [{ kind: 'refund_fee', source: 'estimate', amount_cents: 100 }] }), 'INVALID_INPUT')
  await refused(async () => record({ ...base, payment_id: 0, lines: [{ kind: 'other', source: 'formula', amount_cents: 1 }] }), 'NOT_FOUND')
})

it('keeps refund fees in their own scope and adds them to the payment total', async () => {
  const id = await waffoSale(4990)
  await waffoEstimate(id, 4990)
  const refundFee = await schedule('waffo', 'card', 'refund_fee')
  const out = await record({ payment_id: id, idempotency_key: 'refund_fee:REF_1', refund_id: 'REF_1', basis_cents: 1000,
    lines: [{ kind: 'refund_fee', source: 'estimate', schedule_id: refundFee }] })
  expect(out).toMatchObject({ applied: true, revision: 1, fee_cents: 345, fee_status: 'estimated' })
  await record({ payment_id: id, idempotency_key: 'waffo_settlement:REF_1', refund_id: 'REF_1', actual_cents: 100,
    lines: [{ kind: 'refund_fee', source: 'waffo_settlement', schedule_id: refundFee }] })
  expect(await current(id)).toEqual([
    { kind: 'acquiring', amount_cents: 245, source: 'estimate', status: 'estimated', revision: 1, refund_id: null },
    { kind: 'refund_fee', amount_cents: 100, source: 'waffo_settlement', status: 'final', revision: 2, refund_id: 'REF_1' }])
  expect(await fees(id)).toEqual({ fee_cents: 345, fee_status: 'estimated' })
  await refused(async () => record({ payment_id: id, idempotency_key: 'waffo_settlement:REF_1', basis_cents: 4990,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await schedule('waffo', 'card', 'acquiring') }] }), 'PAYMENT_FEE_KEY_CONFLICT')
})

it('never rewrites lines or rates in place', async () => {
  const id = await waffoSale(990)
  await waffoEstimate(id, 990)
  await refused(async () => db.query('update payment_fee_lines set amount_cents=0 where payment_id=$1', [id]), 'PAYMENT_FEE_LINES_APPEND_ONLY')
  const acq = await schedule('waffo', 'card', 'acquiring')
  await refused(async () => db.query('update payment_fee_schedules set rate_bp=1 where id=$1', [acq]), 'PAYMENT_FEE_SCHEDULE_IMMUTABLE')
  await refused(async () => db.query('delete from payment_fee_schedules where id=$1', [acq]), 'PAYMENT_FEE_SCHEDULE_IMMUTABLE')
})

it('admins add rate versions and switch them off; rates never change in place; every save is audited', async () => {
  const actor = await createUser(db)
  await db.query("update profiles set role='admin' where id=$1", [actor])
  const save = async (input: object, who = actor) => Number((await row(db, 'select admin_payment_fee_schedule_save($1,$2) as id', [who, input])).id)
  const later = { channel: 'waffo', method: 'card', kind: 'acquiring', rate_bp: 420, fixed_cents: 50, rounding: 'ceil', effective_from: '2031-01-01T00:00:00Z' }
  const id = await save(later)
  expect(await row(db, "select (payment_fee_schedule_for('waffo','card','acquiring','2031-02-01')).rate_bp r")).toEqual({ r: 420 })
  expect(await row(db, "select (payment_fee_schedule_for('waffo','card','acquiring','2030-12-31')).rate_bp r")).toEqual({ r: 390 })
  await refused(async () => save(later), 'PAYMENT_FEE_SCHEDULE_EXISTS')
  await refused(async () => save({ id, rate_bp: 1 }), 'PAYMENT_FEE_SCHEDULE_IMMUTABLE')
  await refused(async () => save({ id, active: false }, await createUser(db)), 'NOT_ADMIN')
  await save({ id, active: false, note: 'withdrawn' })
  expect(await row(db, "select (payment_fee_schedule_for('waffo','card','acquiring','2031-02-01')).rate_bp r")).toEqual({ r: 390 })
  expect(await row(db, "select count(*)::int n from admin_audit_log where target_id=$1 and action='affiliate_settings'",
    ['payment_fee_schedule:' + id])).toEqual({ n: 2 })
})

it('recomputes the commission when fees are written (F5, migration 1740: net of fees)', async () => {
  const f = await setupAffiliate(db)
  const payment = await sale(db, f.buyer, 'pack_m', 2490)
  expect(await commission(db, payment.id)).toMatchObject({ amount: 373 })
  await record({ payment_id: payment.id, idempotency_key: 'k', basis_cents: 2490,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await schedule('stripe', 'card', 'acquiring') }] })
  expect(await fees(payment.id)).toEqual({ fee_cents: 102, fee_status: 'estimated' })
  expect(await commission(db, payment.id)).toMatchObject({ amount: 358, status: 'pending' })
})

it('is service-role only: no client role reads the tables or runs the functions', async () => {
  for (const table of ['payment_fee_lines', 'payment_fee_schedules', 'payment_fee_settings']) {
    expect(await row(db, `select has_table_privilege('anon',$1,'select') a,has_table_privilege('authenticated',$1,'select') u,
      has_table_privilege('service_role',$1,'select') s,has_table_privilege('service_role',$1,'insert') i,
      has_table_privilege('service_role',$1,'update') w,has_table_privilege('service_role',$1,'delete') d`, [table]))
      .toEqual({ a: false, u: false, s: true, i: false, w: false, d: false })
  }
  for (const fn of ['payment_fee_amount(bigint,integer,integer,text)', 'payment_fee_schedule_for(text,text,text,timestamptz)',
    'payment_fee_lines_current(bigint)', 'payment_fee_record(jsonb)', 'admin_payment_fee_schedule_save(uuid,jsonb)']) {
    expect(await row(db, `select has_function_privilege('anon',$1,'execute') a,has_function_privilege('authenticated',$1,'execute') u,
      has_function_privilege('service_role',$1,'execute') s`, [fn])).toEqual({ a: false, u: false, s: true })
  }
  for (const fn of ['_payment_fee_refresh(bigint)', '_payment_fee_split(jsonb,bigint,bigint)',
    '_payment_fee_line(payments,jsonb,integer,text,bigint)']) {
    expect(await row(db, `select has_function_privilege('service_role',$1,'execute') s`, [fn])).toEqual({ s: false })
  }
})
