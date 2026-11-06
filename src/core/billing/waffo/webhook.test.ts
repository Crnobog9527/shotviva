import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { chargedMethod, paymentFacts, readWaffoOrder, toCents } from './payment-facts'
import { WAFFO_SIGNATURE_WINDOW_MS, handleWaffoWebhook, verifyWaffoEvent, type WaffoWebhookDeps } from './webhook'
import { WAFFO_STORE, orderCompleted, refundSucceeded, signWaffo, subscriptionPaid, subscriptionState, waffoKeys } from '../../../../tests/fakes/waffo'

// Signature and routing rules, and the arguments handed to settle_waffo_order; the grant itself runs against real Supabase in
// tests/db/waffo-webhook.test.ts.

const USER = '00000000-0000-4000-8000-000000000001'
const keys = waffoKeys()
const otherKeys = waffoKeys()
const NOW = 1_800_000_000_000

let rpc: ReturnType<typeof vi.fn>
let deps: WaffoWebhookDeps

beforeEach(() => {
  rpc = vi.fn(async () => ({ data: { applied: true, credits: 20, free_credits: 0, paid_until: null }, error: null }))
  deps = {
    db: { rpc } as unknown as WaffoWebhookDeps['db'],
    products: TEST_PRODUCTS,
    publicKey: keys.publicKey,
    storeId: WAFFO_STORE,
    mode: 'test',
    now: () => NOW,
    trackBuy: vi.fn(),
  }
})

const body = (event: unknown) => JSON.stringify(event)

describe('verifyWaffoEvent', () => {
  const event = orderCompleted({ userId: USER, productId: 'pack_s' })
  const raw = body(event)

  it('accepts Waffo’s signature over t.rawBody', () => {
    expect(verifyWaffoEvent(deps, raw, signWaffo(raw, keys.privateKey, NOW))?.eventId).toBe(event.eventId)
  })

  it('accepts a retry that replays the original t up to 45 minutes later', () => {
    const t = NOW - WAFFO_SIGNATURE_WINDOW_MS + 1000
    expect(verifyWaffoEvent(deps, raw, signWaffo(raw, keys.privateKey, t))).not.toBeNull()
  })

  it.each([
    ['another key', () => signWaffo(raw, otherKeys.privateKey, NOW)],
    ['a missing header', () => null],
    ['a malformed header', () => 'v1=abc,t=1'],
    ['a stale timestamp', () => signWaffo(raw, keys.privateKey, NOW - WAFFO_SIGNATURE_WINDOW_MS - 1000)],
    ['a future timestamp', () => signWaffo(raw, keys.privateKey, NOW + 120_000)],
  ])('rejects %s', (_, header) => {
    expect(verifyWaffoEvent(deps, raw, header())).toBeNull()
  })

  it('rejects a body changed after signing', () => {
    const header = signWaffo(raw, keys.privateKey, NOW)
    expect(verifyWaffoEvent(deps, raw.replace('pack_s', 'pack_l'), header)).toBeNull()
  })

  it('rejects a validly signed event for another store or the other environment', () => {
    for (const other of [orderCompleted({ userId: USER, productId: 'pack_s', storeId: 'STO_other' }), orderCompleted({ userId: USER, productId: 'pack_s', mode: 'prod' })]) {
      const text = body(other)
      expect(verifyWaffoEvent(deps, text, signWaffo(text, keys.privateKey, NOW))).toBeNull()
    }
  })
})

describe('handleWaffoWebhook', () => {
  const deliver = (event: unknown) => {
    const raw = body(event)
    return handleWaffoWebhook(deps, { body: raw, signature: signWaffo(raw, keys.privateKey, NOW) })
  }

  it('answers 400 on a bad signature and never calls the database', async () => {
    const raw = body(orderCompleted({ userId: USER, productId: 'pack_s' }))
    const result = await handleWaffoWebhook(deps, { body: raw, signature: signWaffo(raw, otherKeys.privateKey, NOW) })
    expect(result).toEqual({ status: 400, body: { code: 'INVALID_SIGNATURE' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('grants an order through apply_purchase keyed by the event id', async () => {
    const event = orderCompleted({ userId: USER, productId: 'pack_s', method: 'alipay' })
    expect(await deliver(event)).toEqual({ status: 200, body: { received: true, outcome: 'applied' } })
    expect(rpc).toHaveBeenCalledWith('settle_waffo_order', {
      p_user_id: USER,
      p_product_id: 'pack_s',
      p_payment_id: event.eventId,
      p_order_id: event.data.orderId,
      p_amount_total: 2149,
      p_currency: 'usd',
      p_amount_tax: 159,
      p_method: 'alipay',
    })
    expect(deps.trackBuy).toHaveBeenCalledWith(USER, expect.objectContaining({ channel: 'waffo', form: 'one_time', method: 'alipay', amount_usd: 19.9 }), 'en')
  })

  it('records a refund without touching credits, and ignores other events', async () => {
    expect((await deliver(refundSucceeded('PAY_1'))).status).toBe(200)
    // Plan changes are never started from this site: acknowledged, nothing applied.
    expect((await deliver({ ...refundSucceeded('PAY_1'), eventType: 'subscription.plan_change_scheduled' })).status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 500 (Waffo retries) when the order carries no metadata from our checkout', async () => {
    const result = await deliver(orderCompleted({ userId: USER, productId: 'pack_s', metadata: {} }))
    expect(result.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 500 when the database fails, so the retry can grant', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
    expect((await deliver(orderCompleted({ userId: USER, productId: 'pack_s' }))).status).toBe(500)
  })
})

describe('handleWaffoWebhook, card subscriptions (T50)', () => {
  const deliver = (event: unknown) => {
    const raw = body(event)
    return handleWaffoWebhook(deps, { body: raw, signature: signWaffo(raw, keys.privateKey, NOW) })
  }

  it('grants every subscription charge through settle_waffo_order, keyed by the payment id (T50)', async () => {
    const event = subscriptionPaid({ userId: USER, productId: 'pro_monthly', orderId: 'ORD_sub1', periodNumber: 2 })
    const result = await deliver(event)
    expect(result).toMatchObject({ status: 200, body: { outcome: 'applied' } })
    expect(rpc).toHaveBeenCalledWith('settle_waffo_order', expect.objectContaining({ p_user_id: USER, p_product_id: 'pro_monthly', p_payment_id: event.eventId, p_order_id: 'ORD_sub1', p_method: 'card' }))
    expect(deps.trackBuy).toHaveBeenCalledWith(USER, expect.objectContaining({ form: 'subscription', channel: 'waffo', product_id: 'pro_monthly' }), 'en')
  })

  it('a failed charge (past_due) grants nothing and only updates the mirror', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    const event = subscriptionState({ userId: USER, productId: 'pro_monthly', orderId: 'ORD_sub1', eventType: 'subscription.past_due', orderStatus: 'past_due', timestamp: '2026-12-06T08:31:00.000Z' })
    expect((await deliver(event)).status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('sync_waffo_subscription', {
      p_user_id: USER,
      p_order_id: 'ORD_sub1',
      p_product_id: 'pro_monthly',
      p_status: 'past_due',
      p_current_period_end: null,
      p_cancel_at_period_end: false,
      p_event_at: '2026-12-06T08:31:00.000Z',
    })
  })

  it.each([
    ['subscription.activated', 'active', 'active', false],
    ['subscription.renewed', 'active', 'active', false],
    ['subscription.recovered', 'active', 'active', false],
    ['subscription.canceling', 'canceling', 'active', true],
    ['subscription.uncanceled', 'active', 'active', false],
    ['subscription.canceled', 'canceled', 'canceled', false],
  ])('%s (%s) mirrors as %s, cancel_at_period_end %s', async (eventType, orderStatus, status, cancel) => {
    rpc.mockResolvedValue({ data: true, error: null })
    const event = subscriptionState({ userId: USER, productId: 'max_yearly', orderId: 'ORD_sub2', eventType, orderStatus, currentPeriodEnd: '2027-11-06' })
    expect((await deliver(event)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('sync_waffo_subscription', expect.objectContaining({ p_status: status, p_cancel_at_period_end: cancel, p_current_period_end: '2027-11-06T00:00:00.000Z' }))
  })
})

describe('paymentFacts', () => {
  const pack = TEST_PRODUCTS.find((p) => p.id === 'pack_s')!
  const order = (data: Record<string, unknown>) => readWaffoOrder('PAY_1', { orderId: 'ORD_1', orderMetadata: { user_id: USER, product_id: 'pack_s' }, ...data })

  it('records what Waffo charged, tax included, in cents', () => {
    expect(paymentFacts(order({ chargedAmount: '10.79', currency: 'USD', listPrice: { total: '10.79', subtotal: '9.90', taxAmount: '0.89' } }), pack))
      .toEqual({ orderId: 'ORD_1', amountTotal: 1079, amountTax: 89, currency: 'usd', method: 'card', subtotalUsd: 9.9 })
  })

  it('falls back to the list total, then to the site price, never refusing a paid order', () => {
    expect(paymentFacts(order({ listPrice: { total: '9.9' } }), pack)).toMatchObject({ amountTotal: 990, amountTax: 0, subtotalUsd: 9.9 })
    expect(paymentFacts(order({}), pack)).toMatchObject({ amountTotal: 990, amountTax: 0, currency: 'usd' })
  })

  it('reads the wallet from the brand: Alipay is alipay, cards and anything else are card', () => {
    expect(chargedMethod({ paymentMethod: 'ewallet', paymentMethodBrand: 'alipayhk' })).toBe('alipay')
    expect(chargedMethod({ paymentMethod: 'card', paymentMethodBrand: 'visa' })).toBe('card')
    expect(toCents('1234.5')).toBe(123450)
  })
})
