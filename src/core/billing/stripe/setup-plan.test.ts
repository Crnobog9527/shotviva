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
    expect(plan).toMatchObject({ createProducts: [], createPrices: [], existingProducts: 6, existingPrices: 15, mismatches: [] })
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
    account.existingPrices.set('pro_yearly_recurring', { ...price, unitAmount: 34800, recurring: 'month' })
    account.existingPrices.set('pack_s', { ...(account.existingPrices.get('pack_s') as ExistingPrice), metadataProductId: null })
    account.existingProducts.set('shotviva_max', { id: 'shotviva_max', active: true, taxCode: null })
    const plan = planSetup({ products, brand, ...account })
    expect(plan.mismatches).toHaveLength(3)
    expect(plan.mismatches.join('\n')).toMatch(/shotviva_max tax code is unset/)
    expect(plan.mismatches.join('\n')).toMatch(/pro_yearly_recurring .*amount 34800 usd ≠ 34900 usd, recurring month ≠ year/)
    expect(plan.mismatches.join('\n')).toMatch(/pack_s .*metadata\.product_id null ≠ pack_s/)
  })

  it('treats an archived Price under the lookup key as a mismatch', () => {
    const account = fullAccount()
    account.existingPrices.set('max_monthly', { ...(account.existingPrices.get('max_monthly') as ExistingPrice), active: false })
    expect(planSetup({ products, brand, ...account }).mismatches).toEqual([expect.stringMatching(/max_monthly .*archived/)])
  })
})
