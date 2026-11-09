import { expect, it, vi } from 'vitest'

import { quoteMetadata } from '../checkout-price'
import { testProduct } from '../stripe/test-products'
import { USER } from '../stripe/test-checkout'
import { fulfilWaffoOrder } from './fulfil'

const quote = { credits: 4990, memberTier: 'max', cents: 4242 } as const
const meta = { user_id: USER, product_id: 'pack_l', ...quoteMetadata(quote) }
const event = { eventId: 'PAY_order', data: { orderId: 'ORD_1', orderMerchantExternalId: 'v2_ref', paymentStatus: 'succeeded',
  chargedAmount: '44.42', currency: 'USD', listPrice: { subtotal: '42.42', taxAmount: '2.00', total: '44.42' }, orderMetadata: meta } }

function harness() {
  const products = [{ ...testProduct('pack_l'), credits: 4990 }]
  const settled = { applied: true, paid_until: null, free_credits: 0, credits: 4995 }
  const rpc = vi.fn().mockResolvedValueOnce({ data: settled, error: null }).mockResolvedValue({ data: { ...settled, applied: false }, error: null })
  return { products, db: { rpc }, applyCodes: vi.fn(), trackBuy: vi.fn() }
}

it('passes actual charge and tax to the versioned RPC with one unchanged payment key on retries', async () => {
  const deps = harness()
  await expect(fulfilWaffoOrder(deps, event)).resolves.toBe('applied')
  await expect(fulfilWaffoOrder(deps, event)).resolves.toBe('replayed')
  expect(deps.db.rpc).toHaveBeenCalledWith('settle_waffo_order_v2', expect.objectContaining({ p_payment_id: 'PAY_order', p_amount_total: 4442, p_amount_tax: 200 }))
  expect(deps.trackBuy).toHaveBeenCalledExactlyOnceWith(USER, expect.objectContaining({ credits: 4990, amount_usd: 42.42 }), 'en')
  expect(deps.applyCodes).toHaveBeenCalledWith(expect.objectContaining({ codeId: null, amountDiscount: 0 }))
})

it.each([
  { currency: 'EUR' }, { chargedAmount: '0.00' }, { chargedAmount: undefined },
  { orderMetadata: { ...meta, pricing_version: 'next' } }, { orderMetadata: { user_id: USER, product_id: 'pack_l' } },
])('fails closed on incomplete or inconsistent v2 payment evidence', async change => {
  const deps = harness()
  await expect(fulfilWaffoOrder(deps, { ...event, data: { ...event.data, ...change } })).rejects.toThrow()
  expect(deps.db.rpc).not.toHaveBeenCalled()
})

it('settles an outstanding old annual order on its old fallback terms', async () => {
  const deps = { ...harness(), products: [{ ...testProduct('max_yearly'), priceUsd: 891, credits: 168000 }] }
  await fulfilWaffoOrder(deps, { eventId: 'PAY_old', data: { orderId: 'ORD_old', orderMetadata: { user_id: USER, product_id: 'max_yearly' } } }, 'subscription')
  expect(deps.db.rpc).toHaveBeenCalledWith('settle_waffo_order', expect.objectContaining({ p_amount_total: 71300 }))
  expect(deps.trackBuy.mock.calls[0][1]).not.toHaveProperty('credits')
})
