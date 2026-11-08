import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureAlert } from '@/core/analytics/capture-error'
import { applyClawback, previewClawback } from '@/core/admin'
import type { ProductId } from '@/core/config'
import { handleStripeWebhook, priceCents, type DisputeEvidenceConfig } from '@/core/billing/stripe'
import { site } from '@/site/site.config'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { chargeObject, checkoutSession, disputeObject, eventFor, signed, stripeHarness, type Harness } from './stripe-fixtures'

// T71 (ARCHITECTURE §6.2 「退款自动扣回积分」): Stripe refunds and disputes take the payment's
// credits back by its own books (granted × refunded share − settled, capped at the paid balance,
// never negative, the rest written off), the admin's 「扣回剩余积分」 is counted, a won dispute
// gives its share back, and every replay changes nothing. Memberships: see clawback-membership.

vi.mock('@/core/analytics/capture-error', () => ({ captureAlert: vi.fn(), captureError: vi.fn() }))

let db: Client
let h: Harness

const evidence: DisputeEvidenceConfig = {
  managedPayments: false,
  context: (productId, charge) => ({
    brand: 'Shotviva',
    origin: 'https://shotviva.com',
    product: productId ? { name: `Shotviva ${productId}`, credits: 20, membership: null } : null,
    refundPolicyText: 'Refund Policy text',
    termsUrl: 'https://shotviva.com/terms',
    refundUrl: 'https://shotviva.com/refund-policy',
    charge,
  }),
}

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
  h.deps.evidence = evidence
  vi.mocked(captureAlert).mockClear()
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))

const cents = (productId: ProductId) => priceCents(site.billing.products.find((p) => p.id === productId)!)

async function buy(userId: string, productId: ProductId = 'pack_s', method: 'card' | 'alipay' = 'card') {
  const charge = chargeObject({ amount: cents(productId), method })
  h.charges.set(charge.id, charge)
  const session = checkoutSession({ userId, productId, method, charge })
  h.sessions.set(session.id, session)
  await deliver(eventFor('checkout.session.completed', session.id))
  return { charge, session }
}

function refund(charge: Stripe.Charge, amountRefunded: number) {
  h.charges.set(charge.id, { ...charge, amount_refunded: amountRefunded, refunded: amountRefunded >= charge.amount })
  return eventFor('charge.refunded', charge.id)
}

async function paymentOf(chargeId: string) {
  const { rows } = await db.query(
    'select id::text, status, amount_refunded, credits_clawed_back, clawback_shortfall from public.payments where stripe_charge_id = $1',
    [chargeId],
  )
  return rows[0]
}

const clawbackRows = async (userId: string) => (await ledgerOf(db, userId)).filter((row) => row.kind.startsWith('clawback'))

describe('charge.refunded takes the credits back', () => {
  it('a full refund of a pack takes all 20 back, once, booked on the payment', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    expect((await profileOf(db, userId)).credits).toBe(20)
    const event = refund(charge, 990)

    expect((await deliver(event)).body.outcome).toBe('recorded')
    await deliver(event)
    await deliver(refund(charge, 990))

    expect((await profileOf(db, userId)).credits).toBe(0)
    const payment = await paymentOf(charge.id)
    expect(payment).toMatchObject({ status: 'refunded', amount_refunded: 990, credits_clawed_back: 20, clawback_shortfall: 0 })
    expect(await clawbackRows(userId)).toEqual([expect.objectContaining({ kind: 'clawback', pool: 'paid', delta: -20 })])
    const linked = await db.query("select payment_id::text from public.credit_ledger where user_id = $1 and kind = 'clawback'", [userId])
    expect(linked.rows).toEqual([{ payment_id: payment.id }])
    expect(captureAlert).toHaveBeenCalledWith('charge_refunded', expect.stringContaining('20 credits clawed back'), expect.anything())
  })

  it('partial refunds take the refunded share (floored); the rest follows with the rest of the money', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    await deliver(refund(charge, 400))
    // 20 × 400 / 990 = 8.08 → 8
    expect((await profileOf(db, userId)).credits).toBe(12)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'partially_refunded', credits_clawed_back: 8 })
    await deliver(refund(charge, 990))
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'refunded', credits_clawed_back: 20, clawback_shortfall: 0 })
  })

  it('credits already spent: the balance stops at 0, the rest is written off, and a later top-up is never touched', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    await db.query('update public.profiles set credits = 5 where id = $1', [userId])
    const event = refund(charge, 990)

    await deliver(event)
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 5, clawback_shortfall: 15 })
    expect(captureAlert).toHaveBeenCalledWith('clawback_shortfall', expect.stringContaining('15 credits'), expect.anything())

    await buy(userId)
    await deliver(event)
    expect((await profileOf(db, userId)).credits).toBe(20)
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 5, clawback_shortfall: 15 })
  })

  it('never negative even when the balance is already 0', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    await db.query('update public.profiles set credits = 0 where id = $1', [userId])
    await deliver(refund(charge, 990))
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 0, clawback_shortfall: 20 })
    expect(await clawbackRows(userId)).toEqual([])
  })
})

describe('「扣回这笔付款的剩余积分」 (admin)', () => {
  async function adminId() {
    const id = await createUser(db)
    await db.query("update public.profiles set role = 'admin' where id = $1", [id])
    return id
  }

  it('takes what is left of the purchase; the pro-rata refund that follows takes nothing more', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    // 8 of the 20 were used.
    await db.query('update public.profiles set credits = 12 where id = $1', [userId])
    const { id } = await paymentOf(charge.id)
    const admin = await adminId()

    expect(await previewClawback(serviceSupabase(), id)).toMatchObject({ granted: 20, clawedBack: 0, balance: 12, available: 12 })
    expect(await applyClawback(serviceSupabase(), id, admin)).toEqual({ taken: 12, clawedBack: 12, shortfall: 0 })
    // A double submit takes nothing.
    expect(await applyClawback(serviceSupabase(), id, admin)).toMatchObject({ taken: 0 })

    // 60% back: 20 × 594 / 990 = 12, already settled.
    await deliver(refund(charge, 594))
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 12, clawback_shortfall: 0, status: 'partially_refunded' })
    expect(await clawbackRows(userId)).toHaveLength(1)
    const audit = await db.query("select target_id from public.admin_audit_log where action = 'clawback_payment' and user_id = $1", [userId])
    expect(audit.rows).toEqual([{ target_id: id }])
  })

  it('only an admin can do it', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    const { id } = await paymentOf(charge.id)
    await expect(applyClawback(serviceSupabase(), id, userId)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await profileOf(db, userId)).credits).toBe(20)
  })
})

describe('disputes: everything back at once, given back on a win', () => {
  // Under review already: Stripe takes no evidence, so these tests leave the draft out (T82 covers it).
  function dispute(charge: Stripe.Charge) {
    const opened = disputeObject(charge, { status: 'under_review' })
    h.disputes.set(opened.id, opened)
    return opened
  }

  function close(opened: Stripe.Dispute, status: string) {
    h.disputes.set(opened.id, { ...opened, status } as Stripe.Dispute)
    return eventFor('charge.dispute.closed', opened.id)
  }

  const disputeRow = async (id: string) =>
    (await db.query('select credits_clawed_back, clawback_shortfall, closed_status, credits_restored from public.payment_disputes where stripe_dispute_id = $1', [id])).rows[0]

  it('charge.dispute.created takes all 20; won gives them back once and the payment is paid again', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    const opened = dispute(charge)
    const created = eventFor('charge.dispute.created', opened.id)
    await deliver(created)
    await deliver(created)
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await disputeRow(opened.id)).toMatchObject({ credits_clawed_back: 20, clawback_shortfall: 0 })
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'disputed', credits_clawed_back: 20 })

    const won = close(opened, 'won')
    expect((await deliver(won)).body.outcome).toBe('kept')
    expect((await deliver(won)).body.outcome).toBe('replayed')
    expect((await profileOf(db, userId)).credits).toBe(20)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'paid', credits_clawed_back: 0, clawback_shortfall: 0 })
    expect(await disputeRow(opened.id)).toMatchObject({ closed_status: 'won', credits_restored: 20 })
    expect((await clawbackRows(userId)).map((row) => row.delta)).toEqual([-20, 20])
  })

  it('lost: the credits stay taken back', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    const opened = dispute(charge)
    await deliver(eventFor('charge.dispute.created', opened.id))
    expect((await deliver(close(opened, 'lost'))).body.outcome).toBe('lost')
    expect((await profileOf(db, userId)).credits).toBe(0)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'disputed', credits_clawed_back: 20 })
    expect(await disputeRow(opened.id)).toMatchObject({ closed_status: 'lost', credits_restored: 0 })
  })

  it('spent credits are written off on the dispute, and a win clears the write-off', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    await db.query('update public.profiles set credits = 5 where id = $1', [userId])
    const opened = dispute(charge)
    await deliver(eventFor('charge.dispute.created', opened.id))
    expect(await paymentOf(charge.id)).toMatchObject({ credits_clawed_back: 5, clawback_shortfall: 15 })
    expect(captureAlert).toHaveBeenCalledWith('clawback_shortfall', expect.stringContaining(opened.id), expect.anything())

    await deliver(close(opened, 'won'))
    expect((await profileOf(db, userId)).credits).toBe(5)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'paid', credits_clawed_back: 0, clawback_shortfall: 0 })
  })

  it('a partial refund before the dispute: the dispute takes the rest, a win gives back only that', async () => {
    const userId = await createUser(db, { credits: 0 })
    const { charge } = await buy(userId)
    await deliver(refund(charge, 495))
    expect((await profileOf(db, userId)).credits).toBe(10)
    const opened = dispute(charge)
    await deliver(eventFor('charge.dispute.created', opened.id))
    expect((await profileOf(db, userId)).credits).toBe(0)
    await deliver(close(opened, 'won'))
    expect((await profileOf(db, userId)).credits).toBe(10)
    expect(await paymentOf(charge.id)).toMatchObject({ status: 'partially_refunded', credits_clawed_back: 10 })
  })

  it('a closed dispute we never recorded is acknowledged and changes nothing', async () => {
    const charge = chargeObject({ amount: 990 })
    const opened = disputeObject(charge)
    h.disputes.set(opened.id, { ...opened, status: 'won' } as Stripe.Dispute)
    expect(await deliver(eventFor('charge.dispute.closed', opened.id))).toEqual({ status: 200, body: { received: true, outcome: 'unknown_dispute' } })
  })
})

describe('who can call it', () => {
  const CALLABLE = ['record_waffo_refund(text, text, integer)', 'close_payment_dispute(text, text)', 'admin_clawback_payment(bigint, uuid)', 'payment_clawback_preview(bigint)']
  const INTERNAL = ['clawback_payment_credits(bigint, text, text)', '_end_membership_after_refund(uuid)', '_payment_granted_credits(public.payments)']

  it('the service role only; the internal steps not even that; payment_refunds is private', async () => {
    for (const fn of CALLABLE) {
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.${fn}', 'execute') as anon, has_function_privilege('authenticated', 'public.${fn}', 'execute') as auth, has_function_privilege('service_role', 'public.${fn}', 'execute') as service`,
      )
      expect({ fn, ...rows[0] }).toEqual({ fn, anon: false, auth: false, service: true })
    }
    for (const fn of INTERNAL) {
      const { rows } = await db.query(`select has_function_privilege('service_role', 'public.${fn}', 'execute') as service`)
      expect({ fn, ...rows[0] }).toEqual({ fn, service: false })
    }
    const { rows } = await db.query("select has_table_privilege('service_role', 'public.payment_refunds', 'select') as service, has_table_privilege('authenticated', 'public.payment_refunds', 'select') as auth")
    expect(rows[0]).toEqual({ service: false, auth: false })
  })
})
