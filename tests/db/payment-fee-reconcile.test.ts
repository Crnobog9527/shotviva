import { randomUUID } from 'node:crypto'

import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { OwnerAlert, PaymentFeeReconcileAlert } from '@/core/alerts'
import { runPaymentFeeReconcile, type ReconcileDeps, type ReconcileStripe } from '@/core/billing/fees/reconcile'
import type { WaffoSettlement } from '@/core/billing/fees/waffo-settlement'

import { connectAdmin, createUser, serviceClient } from './helpers'

// F4 (ARCHITECTURE §6.2 订单手续费 · 对账): the reconciliation job against local Supabase, with fake
// Waffo settlements and fake Stripe objects shaped like F1's measurements. The job writes through
// PostgREST, so rows are committed: everything here lives in a window of its own (record_from in
// 2031, payments moved into it), which no other test's payments reach, and is removed afterwards.

const FROM = new Date('2031-01-01T00:00:00Z')
const DAY = 86_400_000
let db: Client
let recordFrom: Date | null = null
let clock: Date

beforeAll(async () => {
  db = await connectAdmin()
  recordFrom = (await db.query('select record_from from payment_fee_settings')).rows[0].record_from
  await db.query('update payment_fee_settings set record_from = $1', [FROM])
})
afterAll(async () => {
  // Put record_from back first: the other fee tests read it.
  await db.query('update payment_fee_settings set record_from = $1', [recordFrom])
  try {
    await db.query("delete from payment_fee_stripe_batches where txn_id like 'txn_f4t%'")
    await db.query('delete from payments where created_at >= $1', [FROM])
  } finally {
    await db.end()
  }
}, 60_000)

// Each test gets its own month, so earlier tests' payments are past the 60-day look window.
let month = 0
beforeEach(() => {
  month += 3
  clock = new Date(Date.UTC(2031, month, 1))
})
const at = (days: number) => new Date(clock.getTime() + days * DAY)

const settlements = new Map<string, WaffoSettlement | (() => Promise<WaffoSettlement | null>)>()
const charges = new Map<string, Stripe.Charge>()
let feeTxns: Stripe.BalanceTransaction[] = []
const alerts: PaymentFeeReconcileAlert[] = []

const settled = async (id: string) => {
  const found = settlements.get(id)
  return typeof found === 'function' ? found() : (found ?? null)
}
const stripe = {
  charges: { retrieve: async (id: string) => { const c = charges.get(id); if (!c) throw new Error('no such charge'); return c } },
  checkout: { sessions: { retrieve: async () => { throw new Error('not used') } } },
  invoices: { retrieve: async () => { throw new Error('not used') } },
  balanceTransactions: { list: async () => ({ data: feeTxns, has_more: false }) },
} as unknown as ReconcileStripe

function deps(over: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    db: serviceClient(),
    stripe,
    waffo: { payment: settled, refund: settled },
    alert: async (a: OwnerAlert) => { if (a.kind === 'payment_fee_reconcile') alerts.push(a) },
    now: () => clock,
    ...over,
  }
}
const run = (over: Partial<ReconcileDeps> = {}) => runPaymentFeeReconcile(deps(over))

async function moveTo(id: string, when: Date) {
  await db.query('update payments set created_at = $2 where id = $1', [id, when])
}
async function waffoSale(cents: number, created: Date, method = 'card') {
  const buyer = await createUser(db)
  const pay = 'PAY_' + randomUUID().replaceAll('-', '').slice(0, 22)
  await db.query("select settle_waffo_order($1,'pack_s',$2,$3,$4,'usd',0,$5)", [buyer, pay, 'ORD_' + randomUUID(), cents, method])
  const id = (await db.query('select id from payments where waffo_payment_id=$1', [pay])).rows[0].id as string
  await moveTo(id, created)
  return { id, pay }
}
async function stripeSale(cents: number, created: Date, method = 'cn_card') {
  const buyer = await createUser(db)
  const uid = randomUUID().replaceAll('-', '')
  await db.query("select settle_checkout($1,'pack_s',$2,$3,'usd',0,$4,null,$5)", [buyer, 'cs_' + uid, cents, method, 'ch_' + uid])
  const id = (await db.query('select id from payments where stripe_session_id=$1', ['cs_' + uid])).rows[0].id as string
  await moveTo(id, created)
  return { id, charge: 'ch_' + uid }
}
const scheduleOf = async (channel: string, method: string, kind: string) =>
  Number((await db.query("select (payment_fee_schedule_for($1,$2,$3,'2031-01-01')).id as id", [channel, method, kind])).rows[0].id)
async function record(input: Record<string, unknown>) {
  return (await db.query('select payment_fee_record($1) as r', [input])).rows[0].r
}
// What F3's webhook writes for a Waffo charge.
async function waffoEstimate(id: string, cents: number, method = 'card') {
  return record({ payment_id: id, idempotency_key: `estimate:${id}`, basis_cents: cents,
    lines: [{ kind: 'acquiring', source: 'estimate', schedule_id: await scheduleOf('waffo', method, 'acquiring') }] })
}
async function feesOf(id: string) {
  const lines = (await db.query('select kind, amount_cents, source, status, refund_id from payment_fee_lines_current($1)', [id])).rows
  const total = (await db.query('select fee_cents, fee_status from payments where id = $1', [id])).rows[0]
  return { lines: lines.map(l => `${l.refund_id ? 'refund ' : ''}${l.kind} ${l.amount_cents} ${l.source}/${l.status}`), ...total }
}
const issuesOf = (from: number) => alerts.slice(from).flatMap(a => a.issues.map(i => `${i.issue} ${i.ref} ${i.fee ?? ''}`.trim()))

function billedCharge(id: string, amount: number, details: { type: string; amount: number; description?: string }[]): Stripe.Charge {
  return {
    id, object: 'charge', amount, payment_method_details: { type: 'card', card: { country: 'CN' } },
    balance_transaction: {
      id: 'txn_' + id.slice(3), object: 'balance_transaction', amount, currency: 'usd', exchange_rate: null,
      fee: details.reduce((s, d) => s + d.amount, 0),
      fee_details: details.map(d => ({ currency: 'usd', application: null, description: d.description ?? null, ...d })),
    },
  } as unknown as Stripe.Charge
}
const feeTxn = (amount: number, booked: Date, description: string) => ({
  id: 'txn_f4t' + randomUUID().replaceAll('-', '').slice(0, 16), object: 'balance_transaction', type: 'stripe_fee',
  amount: -amount, fee: 0, net: -amount, currency: 'usd', source: null, fee_details: [], description,
  created: Math.floor(booked.getTime() / 1000),
}) as unknown as Stripe.BalanceTransaction

describe('Waffo', () => {
  it('estimate → final once settled; a second run writes nothing and the payment is no longer due', async () => {
    const sale = await waffoSale(990, at(-10))
    await waffoEstimate(sale.id, 990)
    expect(await feesOf(sale.id)).toMatchObject({ lines: ['acquiring 89 estimate/estimated'], fee_status: 'estimated' })
    settlements.set(sale.pay, { feeCents: 89, currency: 'usd', settledAt: null })
    const before = alerts.length
    expect(await run()).toMatchObject({ live: true, looked: 1, written: 1, failed: 0 })
    expect(await feesOf(sale.id)).toMatchObject({ lines: ['acquiring 89 waffo_settlement/final'], fee_cents: 89, fee_status: 'final' })
    expect(await run()).toMatchObject({ looked: 0, written: 0 })
    expect(alerts.length).toBe(before)
  })

  it('a real fee far from the estimate is final and told to the Owner once', async () => {
    const sale = await waffoSale(990, at(-11))
    await waffoEstimate(sale.id, 990)
    settlements.set(sale.pay, { feeCents: 120, currency: 'usd', settledAt: null })
    const before = alerts.length
    await run()
    expect(await feesOf(sale.id)).toMatchObject({ fee_cents: 120, fee_status: 'final' })
    expect(issuesOf(before)).toEqual([`mismatch ${sale.id} acquiring`])
    await run()
    expect(alerts.length).toBe(before + 1)
  })

  it('before day 9 Waffo is not asked; a payment the webhook missed gets the estimate; unsettled past 14 days alerts once', async () => {
    const sale = await waffoSale(1990, at(-5))
    let asked = 0
    settlements.set(sale.pay, async () => { asked += 1; return null })
    await run()
    expect(asked).toBe(0)
    expect(await feesOf(sale.id)).toMatchObject({ lines: ['acquiring 128 estimate/estimated'], fee_status: 'estimated' })
    const next = (await db.query('select next_check_at from payment_fee_reconcile_state where payment_id=$1', [sale.id])).rows[0].next_check_at
    expect(new Date(next).getTime()).toBe(at(4).getTime())

    clock = at(5)
    const before = alerts.length
    await run()
    expect(asked).toBe(1)
    expect(alerts.length).toBe(before)
    clock = at(5)
    await run()
    expect(issuesOf(before)).toEqual([`unreconciled ${sale.id} acquiring`])
    clock = at(1)
    await run()
    expect(alerts.length).toBe(before + 1)
  })

  it("a refund's $1 fee becomes final from its own settlement, under the refund's REF_ id", async () => {
    const sale = await waffoSale(2490, at(-20))
    settlements.set(sale.pay, { feeCents: 148, currency: 'usd', settledAt: null })
    const ref = 'REF_' + randomUUID().replaceAll('-', '').slice(0, 22)
    await db.query('select record_waffo_refund($1,$2,$3)', [sale.pay, ref, 2490])
    await db.query('update payment_refunds set created_at = $2 where refund_ref = $1', [ref, at(-9)])
    await record({ payment_id: sale.id, idempotency_key: `estimate:refund:${ref}`, refund_id: ref, basis_cents: 2490,
      lines: [{ kind: 'refund_fee', source: 'estimate', schedule_id: await scheduleOf('waffo', 'card', 'refund_fee') }] })
    settlements.set(ref, { feeCents: 100, currency: 'usd', settledAt: null })
    await run()
    expect(await feesOf(sale.id)).toMatchObject({
      lines: ['acquiring 148 waffo_settlement/final', 'refund refund_fee 100 waffo_settlement/final'], fee_cents: 248, fee_status: 'final',
    })
  })

  it('a webhook writing between the read and the write: the conflict is retried on the newer revision', async () => {
    const sale = await waffoSale(4990, at(-12))
    await waffoEstimate(sale.id, 4990)
    settlements.set(sale.pay, async () => {
      // F3 (a late estimate under its own key) lands while F4 is talking to Waffo.
      await record({ payment_id: sale.id, idempotency_key: `estimate:late:${sale.id}`, basis_cents: 4990,
        lines: [{ kind: 'acquiring', source: 'estimate', amount_cents: 250 }] })
      return { feeCents: 245, currency: 'usd', settledAt: null }
    })
    expect(await run()).toMatchObject({ written: 1, conflicts: 1, failed: 0 })
    expect(await feesOf(sale.id)).toMatchObject({ lines: ['acquiring 245 waffo_settlement/final'], fee_status: 'final' })
    const revisions = (await db.query('select max(revision)::int r from payment_fee_lines where payment_id=$1', [sale.id])).rows[0].r
    expect(revisions).toBe(3)
  })
})

describe('a look that keeps failing', () => {
  it('backs off and, past the window, is told to the Owner once like any unreconciled payment', async () => {
    const sale = await waffoSale(990, at(-15))
    await waffoEstimate(sale.id, 990)
    settlements.set(sale.pay, async () => { throw new Error('Waffo graphql failed') })
    const before = alerts.length
    expect(await run()).toMatchObject({ looked: 1, failed: 1 })
    expect(issuesOf(before)).toEqual([`unreconciled ${sale.id}`])
    const state = async () => (await db.query('select next_check_at, attempts, last_error from payment_fee_reconcile_state where payment_id=$1', [sale.id])).rows[0]
    expect(await state()).toMatchObject({ attempts: 1, last_error: 'Error' })
    expect(new Date((await state()).next_check_at).getTime()).toBe(at(0).getTime() + 3_600_000)
    clock = new Date(clock.getTime() + 3_600_000)
    await run()
    // Second failure: two hours; still one alert.
    expect(new Date((await state()).next_check_at).getTime()).toBe(clock.getTime() + 2 * 3_600_000)
    expect(alerts.length).toBe(before + 1)
  })
})

describe('a refund that keeps failing', () => {
  it('on a final charge is alerted for the refund, by the refund date', async () => {
    const sale = await waffoSale(990, at(-40))
    await record({ payment_id: sale.id, idempotency_key: `waffo_settlement:${sale.pay}`, basis_cents: 990, actual_cents: 89,
      lines: [{ kind: 'acquiring', source: 'waffo_settlement', source_ref: sale.pay }] })
    const ref = 'REF_' + randomUUID().replaceAll('-', '').slice(0, 22)
    await db.query('select record_waffo_refund($1,$2,$3)', [sale.pay, ref, 500])
    await db.query('update payment_refunds set created_at = $2 where refund_ref = $1', [ref, at(-15)])
    settlements.set(ref, async () => { throw new Error('Waffo graphql failed') })
    const before = alerts.length
    expect(await run()).toMatchObject({ failed: 1 })
    expect(alerts.slice(before).flatMap(a => a.issues)).toEqual([expect.objectContaining({ issue: 'unreconciled', ref: sale.id, fee: 'refund_fee', days: 15 })])
  })
})

describe('Stripe', () => {
  it("a payment whose webhook wrote nothing: the charge's bill is read again (only stripe_fee rows)", async () => {
    const sale = await stripeSale(990, at(-1))
    charges.set(sale.charge, billedCharge(sale.charge, 990, [{ type: 'stripe_fee', amount: 74, description: 'Stripe processing fees' }]))
    await run({ waffo: null })
    expect(await feesOf(sale.id)).toMatchObject({
      lines: ['intl_card 15 stripe_bt/final', 'acquiring 59 stripe_bt/final', 'radar 5 formula/estimated'], fee_status: 'estimated',
    })
    // Radar waits for its batch: due again later, nothing rewritten in between.
    expect(await run({ waffo: null })).toMatchObject({ looked: 0, written: 0 })
  })

  it('Managed Payments 3.5%: one unattributed batch shared to the day\'s MP payments, final; replays add nothing', async () => {
    const a = await stripeSale(990, at(-2), 'card')
    const b = await stripeSale(1990, new Date(at(-2).getTime() + 60_000), 'card')
    for (const [sale, cents, fee] of [[a, 990, 59], [b, 1990, 88]] as const) {
      charges.set(sale.charge, billedCharge(sale.charge, cents, [{ type: 'withheld_tax', amount: 0 }, { type: 'stripe_fee', amount: fee }]))
    }
    await run({ waffo: null })
    expect((await feesOf(a.id)).lines).toEqual(['acquiring 59 stripe_bt/final', 'mp 35 formula/estimated'])
    const day = at(-2).toISOString().slice(0, 10)
    feeTxns = [feeTxn(104, new Date(at(-2).getTime() + 3 * 3_600_000), `Managed Payments Transaction Fee (${day})`)]
    const summary = await run({ waffo: null })
    expect(summary).toMatchObject({ batches: 1, shares: 2, failed: 0 })
    expect(await feesOf(a.id)).toMatchObject({ lines: ['acquiring 59 stripe_bt/final', 'mp 35 formula/final'], fee_cents: 94, fee_status: 'final' })
    expect(await feesOf(b.id)).toMatchObject({ lines: ['acquiring 88 stripe_bt/final', 'mp 69 formula/final'], fee_status: 'final' })
    expect(await run({ waffo: null })).toMatchObject({ batches: 0, shares: 0, written: 0 })
    feeTxns = []
  })

  it('two MP batches the same day, the first unmatched: the second still finds its payments', async () => {
    const base = at(-3)
    const sales = []
    for (const [i, cents, fee] of [[0, 4990, 175], [1, 990, 59], [2, 1990, 88]] as const) {
      const sale = await stripeSale(cents, new Date(base.getTime() + (i + 1) * 60_000), 'card')
      charges.set(sale.charge, billedCharge(sale.charge, cents, [{ type: 'withheld_tax', amount: 0 }, { type: 'stripe_fee', amount: fee }]))
      sales.push(sale)
    }
    const day = base.toISOString().slice(0, 10)
    const first = feeTxn(999, new Date(base.getTime() + 2 * 3_600_000), `Managed Payments Transaction Fee (${day})`)
    const second = feeTxn(104, new Date(base.getTime() + 3 * 3_600_000), `Managed Payments Transaction Fee (${day})`)
    feeTxns = [first, second]
    const before = alerts.length
    expect(await run({ waffo: null })).toMatchObject({ batches: 2, shares: 2 })
    expect(issuesOf(before)).toEqual([`batch_mismatch ${first.id} mp`])
    expect((await feesOf(sales[0].id)).lines).toContain('mp 175 formula/estimated')
    expect((await feesOf(sales[1].id)).lines).toContain('mp 35 formula/final')
    expect((await feesOf(sales[2].id)).lines).toContain('mp 69 formula/final')
    feeTxns = []
  })

  it('a batch whose payments cross UTC midnight takes the next-day payment too', async () => {
    const midnight = at(-5)
    const late = await stripeSale(990, new Date(midnight.getTime() - 30 * 60_000), 'card')
    const early = await stripeSale(1990, new Date(midnight.getTime() + 30 * 60_000), 'card')
    for (const [sale, cents, fee] of [[late, 990, 59], [early, 1990, 88]] as const) {
      charges.set(sale.charge, billedCharge(sale.charge, cents, [{ type: 'withheld_tax', amount: 0 }, { type: 'stripe_fee', amount: fee }]))
    }
    const day = new Date(midnight.getTime() - DAY).toISOString().slice(0, 10)
    feeTxns = [feeTxn(104, new Date(midnight.getTime() + 3 * 3_600_000), `Managed Payments Transaction Fee (${day})`)]
    expect(await run({ waffo: null })).toMatchObject({ batches: 1, shares: 2 })
    expect((await feesOf(late.id)).fee_status).toBe('final')
    expect((await feesOf(early.id)).fee_status).toBe('final')
    feeTxns = []
  })

  it('a late webhook estimate cannot undo a batch share; a rewritten set gets the share again', async () => {
    const sale = await stripeSale(990, at(-3), 'card')
    charges.set(sale.charge, billedCharge(sale.charge, 990, [{ type: 'withheld_tax', amount: 0 }, { type: 'stripe_fee', amount: 59 }]))
    await run({ waffo: null })
    const day = at(-3).toISOString().slice(0, 10)
    feeTxns = [feeTxn(35, new Date(at(-3).getTime() + 3_600_000), `Managed Payments Transaction Fee (${day})`)]
    await run({ waffo: null })
    expect((await feesOf(sale.id)).fee_status).toBe('final')
    // A correction from elsewhere re-estimates MP (a final real line, so it is accepted).
    const bt = 'txn_' + sale.charge.slice(3)
    await record({ payment_id: sale.id, idempotency_key: `correction:${sale.id}`, basis_cents: 990, actual_cents: 59,
      lines: [{ kind: 'acquiring', source: 'stripe_bt', source_ref: bt }, { kind: 'mp', source: 'formula', status: 'estimated', amount_cents: 35 }] })
    expect((await feesOf(sale.id)).fee_status).toBe('estimated')
    expect(await run({ waffo: null })).toMatchObject({ shares: 1 })
    expect(await feesOf(sale.id)).toMatchObject({ lines: ['acquiring 59 stripe_bt/final', 'mp 35 formula/final'], fee_status: 'final' })
    feeTxns = []
  })

  it('a batch nothing explains is told once after a day; an unknown fee entry once; the payments keep their estimate', async () => {
    const sale = await stripeSale(990, at(-4), 'card')
    charges.set(sale.charge, billedCharge(sale.charge, 990, [{ type: 'withheld_tax', amount: 0 }, { type: 'stripe_fee', amount: 59 }]))
    const day = at(-4).toISOString().slice(0, 10)
    const odd = feeTxn(90, new Date(at(-4).getTime() + 3_600_000), `Managed Payments Transaction Fee (${day})`)
    const fresh = feeTxn(91, new Date(clock.getTime() - 3_600_000), `Managed Payments Transaction Fee (${clock.toISOString().slice(0, 10)})`)
    const unknown = feeTxn(70, new Date(at(-4).getTime() + 3_600_000), 'Some new Stripe fee')
    feeTxns = [odd, fresh, unknown]
    const before = alerts.length
    await run({ waffo: null })
    expect(issuesOf(before).sort()).toEqual([`batch_mismatch ${odd.id} mp`, `batch_unknown ${unknown.id}`])
    expect((await feesOf(sale.id)).lines).toContain('mp 35 formula/estimated')
    // The fresh one is not recorded yet (its payments' webhooks may be late).
    const known = (await db.query('select txn_id from payment_fee_stripe_batches where txn_id = any($1)', [[odd.id, fresh.id, unknown.id]])).rows
    expect(known.map(r => r.txn_id).sort()).toEqual([odd.id, unknown.id].sort())
    await run({ waffo: null })
    expect(alerts.length).toBe(before + 1)
    feeTxns = []
  })
})

it('does nothing before record_from is set', async () => {
  await db.query('update payment_fee_settings set record_from = null')
  try {
    expect(await run()).toEqual({ live: false, looked: 0, written: 0, conflicts: 0, failed: 0, batches: 0, shares: 0, alerts: 0 })
  } finally {
    await db.query('update payment_fee_settings set record_from = $1', [FROM])
  }
})

describe('the SQL side', () => {
  it('is service-role only', async () => {
    const { anonClient } = await import('./helpers')
    for (const [fn, args] of [
      ['payment_fee_reconcile_due', { p_now: clock.toISOString(), p_limit: 1 }],
      ['payment_fee_reconcile_mark', { p_payment_id: 1, p_next: clock.toISOString(), p_error: null, p_alerts: [] }],
      ['payment_fee_stripe_batch_record', { p_input: {} }],
      ['payment_fee_stripe_batch_pending', { p_limit: 1 }],
    ] as const) {
      expect((await anonClient().rpc(fn, args)).error).not.toBeNull()
    }
    const tables = (await db.query(`select table_name from information_schema.role_table_grants
      where grantee in ('anon','authenticated') and table_name like 'payment_fee_%'`)).rows
    expect(tables).toEqual([])
  })

  it('a batch is recorded once, and a payment carries one batch per fee kind', async () => {
    const sale = await stripeSale(990, at(-1), 'card')
    const batch = (txn: string) => ({ txn_id: txn, kind: 'mp', amount_cents: 35, booked_at: at(0).toISOString(), label_date: '2031-01-01',
      status: 'allocated', items: [{ payment_id: Number(sale.id), basis_cents: 990, share_cents: 35 }] })
    const first = 'txn_f4t' + randomUUID().replaceAll('-', '').slice(0, 12)
    const second = 'txn_f4t' + randomUUID().replaceAll('-', '').slice(0, 12)
    const rec = async (input: unknown) => (await db.query('select payment_fee_stripe_batch_record($1) r', [input])).rows[0].r
    expect(await rec(batch(first))).toEqual({ applied: true })
    expect(await rec(batch(first))).toEqual({ applied: false, reason: 'replayed' })
    await expect(rec(batch(second))).rejects.toThrow('PAYMENT_FEE_BATCH_TAKEN')
    await expect(rec({ ...batch(second), amount_cents: 36 })).rejects.toThrow('INVALID_INPUT')
  })

  it('remembers each alert key once', async () => {
    const sale = await stripeSale(990, at(-1))
    const mark = async (keys: string[]) => (await db.query('select payment_fee_reconcile_mark($1,$2,null,$3) r', [sale.id, at(1), keys])).rows[0].r
    expect(await mark(['unreconciled'])).toEqual(['unreconciled'])
    expect(await mark(['unreconciled', 'mismatch:charge'])).toEqual(['mismatch:charge'])
    expect(await mark([])).toEqual([])
  })
})
