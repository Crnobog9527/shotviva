import { beforeEach, expect, it, vi } from 'vitest'

import { notifyOwner } from '../../alerts'
import { quoteMetadata } from '../checkout-price'
import { USER } from '../stripe/test-checkout'
import { testProduct } from '../stripe/test-products'
import { fulfilWaffoOrder } from './fulfil'

vi.mock('../../alerts', () => ({ notifyOwner: vi.fn() }))
beforeEach(() => vi.mocked(notifyOwner).mockClear())

const quote = { credits: 4990, memberTier: 'max', cents: 4242 } as const
const meta = { user_id: USER, product_id: 'pack_l', ...quoteMetadata(quote) }
const data = { orderId: 'ORD_1', orderMerchantExternalId: 'v2_ref', paymentStatus: 'succeeded', paymentMethod: 'ALIPAY',
  chargedAmount: '44.42', currency: 'USD', listPrice: { subtotal: '42.42', taxAmount: '2.00', total: '44.42' }, orderMetadata: meta }

function deps(outcomes: ('applied' | 'replayed')[]) {
  const settled = { applied: true, paid_until: null, free_credits: 0, credits: 1 }
  const grant = vi.fn()
  for (const outcome of outcomes) grant.mockResolvedValueOnce({ data: { ...settled, applied: outcome === 'applied' }, error: null })
  // F3's fee step asks payment_fee_target first; no payments row here, so it writes nothing.
  const rpc = vi.fn((fn: string, args: unknown) => fn === 'payment_fee_target' ? Promise.resolve({ data: null, error: null }) : grant(fn, args))
  return { products: [{ ...testProduct('pack_l'), credits: 4990 }], db: { rpc }, grant, applyCodes: vi.fn(), trackBuy: vi.fn() }
}

it('alerts the Owner once for a purchase, however often Waffo redelivers it', async () => {
  const d = deps(['applied', 'replayed', 'replayed'])
  for (let i = 0; i < 3; i += 1) await fulfilWaffoOrder(d, { eventId: 'PAY_1', data })
  expect(notifyOwner).toHaveBeenCalledExactlyOnceWith({ kind: 'payment_received', channel: 'waffo', ref: 'PAY_1', userId: USER, productId: 'pack_l',
    amount: { cents: 4442, currency: 'usd' }, method: 'alipay', renewal: false })
})

it('alerts after the grant is written, and not at all when the order is unpaid or the grant fails', async () => {
  const order: string[] = []
  const d = deps([])
  d.grant.mockImplementationOnce(async () => { order.push('grant'); return { data: { applied: true, paid_until: null, free_credits: 0, credits: 1 }, error: null } })
  vi.mocked(notifyOwner).mockImplementationOnce(() => { order.push('alert') })
  await fulfilWaffoOrder(d, { eventId: 'PAY_2', data })
  expect(order).toEqual(['grant', 'alert'])

  await fulfilWaffoOrder(deps([]), { eventId: 'PAY_3', data: { ...data, paymentStatus: 'pending' } })
  const failing = deps([])
  failing.grant.mockRejectedValue(new Error('db down'))
  await expect(fulfilWaffoOrder(failing, { eventId: 'PAY_4', data })).rejects.toThrow()
  expect(notifyOwner).toHaveBeenCalledTimes(1)
})

it('marks a subscription\'s later periods as renewals and its first charge as a purchase', async () => {
  const sub = { ...data, orderMetadata: { user_id: USER, product_id: 'pro_monthly' }, orderMerchantExternalId: undefined, paymentMethod: 'CARD' }
  const d = { ...deps(['applied', 'applied']), products: [testProduct('pro_monthly')] }
  await fulfilWaffoOrder(d, { eventId: 'PAY_a', data: { ...sub, periodNumber: 1 } }, 'subscription')
  await fulfilWaffoOrder(d, { eventId: 'PAY_b', data: { ...sub, periodNumber: 2 } }, 'subscription')
  expect(vi.mocked(notifyOwner).mock.calls.map(([a]) => a.kind === 'payment_received' && [a.ref, a.renewal])).toEqual([['PAY_a', false], ['PAY_b', true]])
})
