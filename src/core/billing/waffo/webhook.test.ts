import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { WAFFO_SIGNATURE_WINDOW_MS, handleWaffoWebhook, verifyWaffoEvent, type WaffoWebhookDeps } from './webhook'
import { WAFFO_STORE, orderCompleted, refundSucceeded, signWaffo, waffoKeys } from '../../../../tests/fakes/waffo'

// Signature and routing rules; the grant itself runs against real Supabase in
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
    expect(rpc).toHaveBeenCalledWith('apply_purchase', { p_user_id: USER, p_product_id: 'pack_s', p_event_id: event.eventId })
    expect(deps.trackBuy).toHaveBeenCalledWith(USER, expect.objectContaining({ channel: 'waffo', form: 'one_time', method: 'alipay', amount_usd: 19.9 }))
  })

  it('records a refund without touching credits, and ignores other events', async () => {
    expect((await deliver(refundSucceeded('PAY_1'))).status).toBe(200)
    expect((await deliver({ ...refundSucceeded('PAY_1'), eventType: 'subscription.activated' })).status).toBe(200)
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
