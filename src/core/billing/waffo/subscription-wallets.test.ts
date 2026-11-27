import { beforeEach, expect, it, vi } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { handleWaffoWebhook, type WaffoWebhookDeps } from './webhook'
import { WAFFO_STORE, signWaffo, subscriptionPaid, waffoKeys } from '../../../../tests/fakes/waffo'

// The grant itself runs against real Supabase in tests/db/waffo-subscription.test.ts; here, what a
// subscription charge paid with a card wallet hands to settle_waffo_order.

const USER = '00000000-0000-4000-8000-000000000001'
const keys = waffoKeys()
const NOW = 1_800_000_000_000

let rpc: ReturnType<typeof vi.fn>
let deps: WaffoWebhookDeps

beforeEach(() => {
  rpc = vi.fn(async (fn: string) => fn === 'payment_fee_target' ? { data: null, error: null } : { data: { applied: true, credits: 20, free_credits: 0, paid_until: null }, error: null })
  deps = {
    db: { rpc } as unknown as WaffoWebhookDeps['db'],
    products: TEST_PRODUCTS,
    applyCodes: vi.fn(),
    publicKey: keys.publicKey,
    storeId: WAFFO_STORE,
    mode: 'test',
    now: () => NOW,
    trackBuy: vi.fn(),
  }
})

const deliver = (event: unknown) => {
  const raw = JSON.stringify(event)
  return handleWaffoWebhook(deps, { body: raw, signature: signWaffo(raw, keys.privateKey, NOW) })
}

// Owner 2026-11-25: subscriptions also take Apple Pay and Google Pay. Their charges, first and
// renewal, settle like a card's: recorded as card (same rate), one grant per payment id, and a
// redelivery of the same payment is a replay.
it.each([
  ['card', 'applepay'],
  ['applepay', undefined],
  ['googlepay', 'googlepay'],
  ['ewallet', 'googlepay'],
])('an Apple Pay / Google Pay subscription charge (%s / %s) records card, once per payment', async (paymentMethod, paymentMethodBrand) => {
  const charge = (periodNumber: number) => {
    const event = subscriptionPaid({ userId: USER, productId: 'starter_monthly', orderId: 'ORD_wallet', periodNumber })
    return { ...event, data: { ...event.data, paymentMethod, paymentMethodBrand } }
  }
  const first = charge(1)
  const renewal = charge(2)
  expect((await deliver(first)).body).toMatchObject({ outcome: 'applied' })
  expect((await deliver(renewal)).body).toMatchObject({ outcome: 'applied' })
  const settled = rpc.mock.calls.filter(([fn]) => fn === 'settle_waffo_order').map(([, args]) => args as Record<string, unknown>)
  expect(settled.map((args) => [args.p_payment_id, args.p_method, args.p_order_id])).toEqual([[first.eventId, 'card', 'ORD_wallet'], [renewal.eventId, 'card', 'ORD_wallet']])
  rpc.mockImplementation(async (fn: string) => fn === 'payment_fee_target' ? { data: null, error: null } : { data: { applied: false, credits: 20, free_credits: 0, paid_until: null }, error: null })
  expect((await deliver(renewal)).body).toMatchObject({ outcome: 'replayed' })
})
