import { describe, expect, it } from 'vitest'

import { checkoutUnitPriceDifference } from '../../codes/admin'
import { testProduct } from './test-products'

describe('the checkout price after discount versus the current least expensive subscription per credit', () => {
  const pack = testProduct('pack_s')
  const secondPack = { ...testProduct('pack_l'), priceUsd: 0.01 }
  const subscription = { ...testProduct('pro_yearly'), priceUsd: 3, credits: pack.credits }
  const higher = { ...testProduct('starter_monthly'), priceUsd: 3.5, credits: pack.credits }

  it.each([1, 100])('recomputes the cheapest subscription and per-credit comparison at unit scale %i', (scale) => {
    const compare = (priceUsd: number, subscriptions = [subscription, higher]) => {
      const products = [...subscriptions, { ...pack, priceUsd }, secondPack]
      return checkoutUnitPriceDifference(products.map(p => ({ ...p, credits: p.credits * scale })), pack.id, 25)
    }
    expect(compare(3.99)).toBeLessThan(BigInt(0))
    expect(compare(4)).toBe(BigInt(0))
    expect(compare(4.01)).toBeGreaterThan(BigInt(0))
    expect(compare(4, [{ ...subscription, priceUsd: 5 }, higher])).toBeLessThan(BigInt(0))
  })

  it('compares collectible cents when a percentage creates a half-cent discount', () => {
    const products = [{ ...subscription, priceUsd: 3.99, credits: pack.credits * 2 }, { ...pack, priceUsd: 3.99 }]
    expect(checkoutUnitPriceDifference(products, pack.id, 50)).toBeLessThan(BigInt(0))
  })
})
