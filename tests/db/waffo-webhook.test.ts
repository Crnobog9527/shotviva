import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleWaffoWebhook, type WaffoWebhookDeps } from '@/core/billing/waffo'
import { paymentCodeEffects } from '@/core/billing'
import { site } from '@/site/site.config'

import { WAFFO_STORE, orderCompleted, paymentId, refundSucceeded, signWaffo, waffoKeys } from '../fakes/waffo'
import { connectAdmin, createUser, DAY_MS, ledgerOf, profileOf } from './helpers'
import { anonSupabase, serviceSupabase } from './supabase-env'

// AGENTS §7 test 2 (Waffo): duplicate and out-of-order events, bad signature → 400, credits
// granted once, one payments row per order. Real local Supabase (settle_waffo_order), real RSA
// signatures.

let db: Client
let deps: WaffoWebhookDeps
let trackBuy: ReturnType<typeof vi.fn<NonNullable<WaffoWebhookDeps['trackBuy']>>>
const keys = waffoKeys()
const forger = waffoKeys()

beforeAll(async () => {
  db = await connectAdmin()
})

afterAll(async () => {
  await db.end()
})

beforeEach(() => {
  trackBuy = vi.fn<NonNullable<WaffoWebhookDeps['trackBuy']>>()
  const admin = serviceSupabase()
  deps = { db: admin, applyCodes: paymentCodeEffects(admin, site.growth.invite), products: site.billing.products, publicKey: keys.publicKey, storeId: WAFFO_STORE, mode: 'test', trackBuy }
})

const daysFromNow = (date: Date | null) => ((date?.getTime() ?? 0) - Date.now()) / DAY_MS

async function paymentsOf(userId: string) {
  const { rows } = await db.query(
    'select product_id, channel, waffo_order_id, stripe_session_id, amount_total, amount_tax, currency, method, status from public.payments where user_id = $1 order by id',
    [userId],
  )
  return rows
}

function deliver(event: unknown, privateKey = keys.privateKey) {
  const body = JSON.stringify(event)
  return handleWaffoWebhook(deps, { body, signature: signWaffo(body, privateKey) })
}

describe('signature', () => {
  it('rejects a forged or tampered event with 400 and grants nothing', async () => {
    const userId = await createUser(db)
    const event = orderCompleted({ userId, productId: 'pack_l' })

    expect((await deliver(event, forger.privateKey)).status).toBe(400)
    const body = JSON.stringify(event)
    const tampered = body.replace('"succeeded"', '"succeeded" ')
    expect((await handleWaffoWebhook(deps, { body: tampered, signature: signWaffo(body, keys.privateKey) })).status).toBe(400)
    expect((await handleWaffoWebhook(deps, { body, signature: null })).status).toBe(400)

    expect(await ledgerOf(db, userId)).toEqual([])
    expect(trackBuy).not.toHaveBeenCalled()
  })
})

describe('order.completed', () => {
  it('a membership buys one period: +30 days and the month’s credits, as one ledger row', async () => {
    const userId = await createUser(db, { freeCredits: 6 })
    const event = orderCompleted({ userId, productId: 'starter_monthly' })

    expect(await deliver(event)).toEqual({ status: 200, body: { received: true, outcome: 'applied' } })
    const profile = await profileOf(db, userId)
    expect(profile).toMatchObject({ credits: 50, free_credits: 6 })
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(30, 2)
    expect(await ledgerOf(db, userId)).toEqual([
      { kind: 'purchase', pool: 'paid', delta: 50, idempotency_key: `purchase:${event.eventId}` },
    ])
    // T10's payments row, written in the same transaction (channel waffo, Waffo order id).
    expect(await paymentsOf(userId)).toEqual([
      {
        product_id: 'starter_monthly',
        channel: 'waffo',
        waffo_order_id: event.data.orderId,
        stripe_session_id: null,
        amount_total: 2149,
        amount_tax: 159,
        currency: 'usd',
        method: 'card',
        status: 'paid',
      },
    ])
  })

  it('a yearly membership is +365 days with the whole year’s credits', async () => {
    const userId = await createUser(db)
    await deliver(orderCompleted({ userId, productId: 'pro_yearly', method: 'alipay' }))
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(1620)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(365, 2)
    expect(trackBuy).toHaveBeenCalledWith(userId, expect.objectContaining({ product_id: 'pro_yearly', channel: 'waffo', method: 'alipay', form: 'one_time' }), 'en')
  })

  it('a pack adds paid credits and leaves paid_until alone', async () => {
    const paidUntil = new Date(Date.now() + 5 * DAY_MS)
    const userId = await createUser(db, { paidUntil })
    await deliver(orderCompleted({ userId, productId: 'pack_m' }))
    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(55)
    expect(profile.paid_until?.getTime()).toBe(paidUntil.getTime())
  })

  it('the same event delivered three times grants once and tracks once', async () => {
    const userId = await createUser(db)
    const event = orderCompleted({ userId, productId: 'pack_s' })

    const outcomes = []
    for (let i = 0; i < 3; i += 1) outcomes.push((await deliver(event)).body.outcome)

    expect(outcomes).toEqual(['applied', 'replayed', 'replayed'])
    expect((await profileOf(db, userId)).credits).toBe(20)
    expect(await ledgerOf(db, userId)).toHaveLength(1)
    expect(await paymentsOf(userId)).toHaveLength(1)
    expect(trackBuy).toHaveBeenCalledTimes(1)
  })

  it('out of order: a refund notice before its order, and two orders reversed, each grants once', async () => {
    const userId = await createUser(db)
    const first = orderCompleted({ userId, productId: 'starter_monthly', eventId: paymentId() })
    const second = orderCompleted({ userId, productId: 'starter_monthly', eventId: paymentId() })

    expect((await deliver(refundSucceeded(first.eventId))).status).toBe(200)
    await deliver(second)
    await deliver(first)
    await deliver(second)

    const profile = await profileOf(db, userId)
    expect(profile.credits).toBe(100)
    expect(daysFromNow(profile.paid_until)).toBeCloseTo(60, 2)
    expect(await ledgerOf(db, userId)).toHaveLength(2)
    expect(await paymentsOf(userId)).toHaveLength(2)
  })

  it('one row per charge: a second payment on the same order grants once more (T50), each payment id once', async () => {
    // order.completed fires once per one-time order; a subscription order has a charge every
    // period, so the order id is no longer unique (ARCHITECTURE §6.2 payments, spec #172).
    const userId = await createUser(db)
    const first = orderCompleted({ userId, productId: 'pack_s' })
    const twinPayment = paymentId()
    const twin = { ...orderCompleted({ userId, productId: 'pack_s' }), eventId: twinPayment, data: { ...first.data, paymentId: twinPayment } }
    await deliver(first)
    expect((await deliver(twin)).status).toBe(200)
    expect((await deliver(twin)).body.outcome).toBe('replayed')
    expect((await profileOf(db, userId)).credits).toBe(40)
    expect(await ledgerOf(db, userId)).toHaveLength(2)
    expect((await paymentsOf(userId)).map((row) => row.waffo_order_id)).toEqual([first.data.orderId, first.data.orderId])
  })

  it('settle_waffo_order is service-role only, and payments stays unwritable directly', async () => {
    const userId = await createUser(db)
    const anon = await anonSupabase().rpc('settle_waffo_order', {
      p_user_id: userId, p_product_id: 'pack_s', p_payment_id: 'PAY_anon', p_order_id: 'ORD_anon',
      p_amount_total: 990, p_currency: 'usd', p_amount_tax: 0, p_method: 'card',
    })
    expect(anon.error).not.toBeNull()
    const direct = await serviceSupabase().from('payments').insert({
      user_id: userId, product_id: 'pack_s', channel: 'waffo', waffo_order_id: 'ORD_direct', amount_total: 990, currency: 'usd', method: 'card',
    })
    expect(direct.error?.message).toMatch(/permission denied/)
    expect(await ledgerOf(db, userId)).toEqual([])
  })

  it('answers 500 for an order without our metadata, granting nothing to anyone', async () => {
    const userId = await createUser(db)
    const result = await deliver(orderCompleted({ userId, productId: 'pack_s', metadata: { user_id: userId } }))
    expect(result.status).toBe(500)
    expect(await ledgerOf(db, userId)).toEqual([])
  })

  it('grants nothing for a payment that did not succeed', async () => {
    const userId = await createUser(db)
    const result = await deliver(orderCompleted({ userId, productId: 'pack_s', paymentStatus: 'failed' }))
    expect(result.body.outcome).toBe('unpaid')
    expect(await ledgerOf(db, userId)).toEqual([])
  })
})
