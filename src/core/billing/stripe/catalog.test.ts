import { describe, expect, it } from 'vitest'

import { checkoutRoute, desiredPrices, lookupKey, stripeProductId } from './catalog'
import { TEST_PRODUCTS, testProduct as product } from './test-products'

describe('checkoutRoute (ARCHITECTURE §6.3)', () => {
  it('sells a membership by card as a Managed Payments subscription with no method list', () => {
    expect(checkoutRoute(product('starter_monthly'), 'card', true)).toEqual({
      mode: 'subscription',
      form: 'subscription',
      lookupKey: 'starter_monthly_recurring',
      managedPayments: true,
      allowedMethods: null,
    })
  })

  it('sells a pack by card as a Managed Payments one-time payment', () => {
    expect(checkoutRoute(product('pack_s'), 'card', true)).toMatchObject({
      mode: 'payment',
      form: 'one_time',
      lookupKey: 'pack_s',
      managedPayments: true,
      allowedMethods: null,
    })
  })

  it('sells one period of a membership by Alipay as a plain one-time payment', () => {
    expect(checkoutRoute(product('pro_yearly'), 'alipay', true)).toEqual({
      mode: 'payment',
      form: 'one_time',
      lookupKey: 'pro_yearly',
      managedPayments: false,
      allowedMethods: ['alipay'],
    })
  })

  it('falls back to a plain card checkout while Managed Payments is off', () => {
    expect(checkoutRoute(product('max_monthly'), 'card', false)).toMatchObject({
      mode: 'subscription',
      managedPayments: false,
      allowedMethods: ['card'],
    })
  })
})

describe('desiredPrices', () => {
  it('lists the 15 Prices of §6.2 with unique lookup keys', () => {
    const prices = desiredPrices(TEST_PRODUCTS)
    expect(prices).toHaveLength(15)
    expect(new Set(prices.map((p) => p.lookupKey)).size).toBe(15)
    expect(prices.filter((p) => p.recurring !== null)).toHaveLength(6)
  })

  it('prices recurring and one-time at the same amount in cents, on the tier Product', () => {
    const prices = desiredPrices(TEST_PRODUCTS).filter((p) => p.productId === 'starter_monthly')
    expect(prices).toEqual([
      { productId: 'starter_monthly', stripeProduct: 'shotviva_starter', unitAmount: 1990, lookupKey: 'starter_monthly_recurring', recurring: 'month' },
      { productId: 'starter_monthly', stripeProduct: 'shotviva_starter', unitAmount: 1990, lookupKey: 'starter_monthly', recurring: null },
    ])
  })

  it('gives each pack its own Product and only a one-time Price', () => {
    expect(stripeProductId(product('pack_l'))).toBe('shotviva_pack_l')
    expect(desiredPrices([product('pack_l')])).toEqual([
      { productId: 'pack_l', stripeProduct: 'shotviva_pack_l', unitAmount: 4990, lookupKey: 'pack_l', recurring: null },
    ])
    expect(lookupKey('pack_l', 'one_time')).toBe('pack_l')
  })
})
