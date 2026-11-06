import { describe, expect, it } from 'vitest'

import { STRIPE_TAX_CODE, desiredPrices } from './catalog'
import { desiredProducts, planSetup, type ExistingPrice, type ExistingProduct } from './setup-plan'
import { TEST_PRODUCTS } from './test-products'

const products = TEST_PRODUCTS
const brand = 'Shotviva'

function fullAccount() {
  const existingProducts = new Map<string, ExistingProduct>(
    desiredProducts(products, brand).map((p) => [p.id, { id: p.id, active: true, taxCode: STRIPE_TAX_CODE }]),
  )
  const existingPrices = new Map<string, ExistingPrice>(
    desiredPrices(products).map((p, i) => [
      p.lookupKey,
      {
        id: `price_${i}`,
        lookupKey: p.lookupKey,
        active: true,
        product: p.stripeProduct,
        currency: 'usd',
        unitAmount: p.unitAmount,
        recurring: p.recurring,
        taxBehavior: 'exclusive',
        metadataProductId: p.productId,
      },
    ]),
  )
  return { existingProducts, existingPrices }
}

describe('planSetup (scripts/stripe-setup.ts)', () => {
  it('creates 6 Products and 15 Prices on an empty account', () => {
    const plan = planSetup({ products, brand, existingProducts: new Map(), existingPrices: new Map() })
    expect(plan.createProducts.map((p) => p.id)).toEqual([
      'shotviva_starter',
      'shotviva_pro',
      'shotviva_max',
      'shotviva_pack_s',
      'shotviva_pack_m',
      'shotviva_pack_l',
    ])
    expect(plan.createProducts[0]?.name).toBe('Shotviva Starter')
    expect(plan.createPrices).toHaveLength(15)
    expect(plan.mismatches).toEqual([])
  })

  it('skips everything already in place (a second run is a no-op)', () => {
    const plan = planSetup({ products, brand, ...fullAccount() })
    expect(plan).toMatchObject({ createProducts: [], createPrices: [], replacePrices: [], existingProducts: 6, existingPrices: 15, mismatches: [] })
  })

  it('creates only what is missing', () => {
    const account = fullAccount()
    account.existingPrices.delete('pack_m')
    const plan = planSetup({ products, brand, ...account })
    expect(plan.createPrices.map((p) => p.lookupKey)).toEqual(['pack_m'])
    expect(plan.createProducts).toEqual([])
  })

  it('reports every mismatch instead of overwriting', () => {
    const account = fullAccount()
    const price = account.existingPrices.get('pro_yearly_recurring')
    if (!price) throw new Error('fixture')
    account.existingPrices.set('pro_yearly_recurring', { ...price, unitAmount: 47800, recurring: 'month' })
    account.existingPrices.set('pack_s', { ...(account.existingPrices.get('pack_s') as ExistingPrice), metadataProductId: null })
    account.existingProducts.set('shotviva_max', { id: 'shotviva_max', active: true, taxCode: null })
    const plan = planSetup({ products, brand, ...account })
    expect(plan.mismatches).toHaveLength(3)
    expect(plan.mismatches.join('\n')).toMatch(/shotviva_max tax code is unset/)
    expect(plan.mismatches.join('\n')).toMatch(/pro_yearly_recurring .*recurring month ≠ year/)
    // A real mismatch is never "fixed" by replacing the Price.
    expect(plan.replacePrices).toEqual([])
    expect(plan.mismatches.join('\n')).toMatch(/pack_s .*metadata\.product_id null ≠ pack_s/)
  })

  it('treats an archived Price under the lookup key as a mismatch', () => {
    const account = fullAccount()
    account.existingPrices.set('max_monthly', { ...(account.existingPrices.get('max_monthly') as ExistingPrice), active: false })
    expect(planSetup({ products, brand, ...account }).mismatches).toEqual([expect.stringMatching(/max_monthly .*archived/)])
  })
})

describe('planSetup price changes (Prices are immutable)', () => {
  it('replaces a Price whose only difference is the amount, both the recurring and the one-time', () => {
    const account = fullAccount()
    for (const key of ['max_yearly_recurring', 'max_yearly']) {
      const price = account.existingPrices.get(key) as ExistingPrice
      account.existingPrices.set(key, { ...price, id: `price_old_${key}`, unitAmount: 69900 })
    }
    const plan = planSetup({ products, brand, ...account })
    expect(plan.mismatches).toEqual([])
    expect(plan.createPrices).toEqual([])
    expect(plan.replacePrices).toEqual([
      { price: expect.objectContaining({ lookupKey: 'max_yearly_recurring', unitAmount: 71300, recurring: 'year' }), oldId: 'price_old_max_yearly_recurring', oldAmount: 69900 },
      { price: expect.objectContaining({ lookupKey: 'max_yearly', unitAmount: 71300, recurring: null }), oldId: 'price_old_max_yearly', oldAmount: 69900 },
    ])
  })

  it('is a no-op once the new Prices hold the lookup keys (rerun)', () => {
    expect(planSetup({ products, brand, ...fullAccount() }).replacePrices).toEqual([])
  })

  it('still stops on a different currency instead of replacing', () => {
    const account = fullAccount()
    account.existingPrices.set('pack_s', { ...(account.existingPrices.get('pack_s') as ExistingPrice), currency: 'eur', unitAmount: 900 })
    const plan = planSetup({ products, brand, ...account })
    expect(plan.mismatches).toEqual([expect.stringMatching(/pack_s .*currency eur ≠ usd/)])
    expect(plan.replacePrices).toEqual([])
  })
})
