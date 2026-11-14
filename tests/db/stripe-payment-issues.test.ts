import type { Client } from 'pg'
import type Stripe from 'stripe'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureAlert } from '@/core/analytics/capture-error'
import { handleStripeWebhook } from '@/core/billing/stripe'

import { connectAdmin, createUser, ledgerOf, profileOf } from './helpers'
import { serviceSupabase } from './supabase-env'
import { chargeObject, checkoutSession, eventFor, paymentsOf, signed, stripeHarness, type Harness } from './stripe-fixtures'

// AGENTS §7 test 2 (Stripe): charge.refunded and charge.dispute.created record on the payment
// and alert in Sentry. Since T71 a refund also takes the credits back (the amounts and edge cases
// are in clawback.test.ts); a dispute's clawback runs in the dispute flow, which this harness
// leaves out (no evidence config), so here a dispute only records.

vi.mock('@/core/analytics/capture-error', () => ({ captureAlert: vi.fn(), captureError: vi.fn() }))

let db: Client
let h: Harness

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  h = stripeHarness()
  vi.mocked(captureAlert).mockClear()
})

const deliver = (event: unknown) => handleStripeWebhook(h.deps, signed(event))

// A settled one-time purchase with its charge, as the refund / dispute tests start from.
async function buyPack(method: 'card' | 'alipay' = 'card') {
  const userId = await createUser(db)
  const charge = chargeObject({ amount: 990, method })
  h.charges.set(charge.id, charge)
  const session = checkoutSession({ userId, productId: 'pack_s', method, charge })
  h.sessions.set(session.id, session)
  await deliver(eventFor('checkout.session.completed', session.id))
  return { userId, charge }
}

function refund(charge: Stripe.Charge, amountRefunded: number) {
  h.charges.set(charge.id, { ...charge, amount_refunded: amountRefunded, refunded: amountRefunded >= charge.amount })
  return eventFor('charge.refunded', charge.id)
}

function dispute(charge: Stripe.Charge) {
  const id = `dp_${charge.id}`
  h.disputes.set(id, { id, object: 'dispute', charge: charge.id } as unknown as Stripe.Dispute)
  return eventFor('charge.dispute.created', id)
}

describe('one-time payments are recorded with their charge', () => {
  it('an Alipay pack: py_ charge, method alipay, no tax', async () => {
    const { userId, charge } = await buyPack('alipay')
    expect(await paymentsOf(db, userId)).toEqual([
      expect.objectContaining({ product_id: 'pack_s', stripe_charge_id: charge.id, method: 'alipay', amount_total: 990, amount_tax: 0, status: 'paid' }),
    ])
  })
})

describe('charge.refunded', () => {
  it('a full refund marks the payment refunded, alerts, and takes the credits back once (T71)', async () => {
    const { userId, charge } = await buyPack()
    const before = await profileOf(db, userId)
    const ledger = await ledgerOf(db, userId)
    const event = refund(charge, 990)

    expect((await deliver(event)).body.outcome).toBe('recorded')
    await deliver(event)

    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ status: 'refunded', amount_refunded: 990 })])
    expect(await profileOf(db, userId)).toEqual({ ...before, credits: before.credits - 20 })
    expect(await ledgerOf(db, userId)).toEqual([...ledger, expect.objectContaining({ kind: 'clawback', delta: -20 })])
    expect(captureAlert).toHaveBeenCalledWith(
      'charge_refunded',
      expect.stringContaining(charge.id),
      { fields: expect.objectContaining({ charge_id: charge.id, user_id: userId, product_id: 'pack_s', status: 'refunded' }) },
    )
  })

  it('a partial refund is partially_refunded, then refunded when the rest follows', async () => {
    const { userId, charge } = await buyPack()
    await deliver(refund(charge, 400))
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ status: 'partially_refunded', amount_refunded: 400 })])
    await deliver(refund(charge, 990))
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ status: 'refunded', amount_refunded: 990 })])
  })

  it('the refunded amount never goes down, whatever order the records arrive in', async () => {
    const { userId, charge } = await buyPack()
    await deliver(refund(charge, 700))
    // An older amount (if Stripe ever answered one) cannot lower what is recorded.
    const { error } = await serviceSupabase().rpc('record_payment_issue', { p_charge_id: charge.id, p_kind: 'refunded', p_amount_refunded: 300 })
    expect(error).toBeNull()
    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ status: 'partially_refunded', amount_refunded: 700 })])
  })

  it('a charge with no payment row (paid before T10) still alerts and answers 200', async () => {
    const charge = chargeObject({ amount: 1990, refunded: 1990 })
    h.charges.set(charge.id, charge)
    expect(await deliver(eventFor('charge.refunded', charge.id))).toEqual({ status: 200, body: { received: true, outcome: 'unknown_charge' } })
    expect(captureAlert).toHaveBeenCalledWith('charge_refunded', expect.any(String), {
      fields: expect.objectContaining({ charge_id: charge.id, known_payment: false }),
    })
  })
})

describe('charge.dispute.created', () => {
  it('marks the payment disputed and alerts; a later refund keeps it disputed (and settles everything)', async () => {
    const { userId, charge } = await buyPack()
    const before = await profileOf(db, userId)

    expect((await deliver(dispute(charge))).body.outcome).toBe('recorded')
    expect(captureAlert).toHaveBeenCalledWith('charge_disputed', expect.stringContaining(charge.id), {
      fields: expect.objectContaining({ user_id: userId, status: 'disputed' }),
    })
    await deliver(refund(charge, 990))

    expect(await paymentsOf(db, userId)).toEqual([expect.objectContaining({ status: 'disputed', amount_refunded: 990 })])
    // A disputed payment owes all of its credits (T71).
    expect(await profileOf(db, userId)).toEqual({ ...before, credits: before.credits - 20 })
  })
})

describe('payments table', () => {
  it('only the SQL functions write it: the service role cannot insert or update directly', async () => {
    const { userId, charge } = await buyPack()
    const service = serviceSupabase()
    const insert = await service.from('payments').insert({
      user_id: userId,
      product_id: 'pack_s',
      channel: 'stripe',
      stripe_session_id: 'cs_direct',
      amount_total: 1,
      currency: 'usd',
      method: 'card',
    })
    expect(insert.error?.message).toMatch(/permission denied/)
    const update = await service.from('payments').update({ status: 'refunded' }).eq('stripe_charge_id', charge.id)
    expect(update.error?.message).toMatch(/permission denied/)
  })

  it('no client role can read it', async () => {
    const { rows } = await db.query(
      "select has_table_privilege('anon', 'public.payments', 'select') as anon, has_table_privilege('authenticated', 'public.payments', 'select') as authed",
    )
    expect(rows[0]).toEqual({ anon: false, authed: false })
  })
})
