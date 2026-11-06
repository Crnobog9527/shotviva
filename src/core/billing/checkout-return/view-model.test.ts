import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import type { CheckoutFacts } from './facts'
import { brandName, fineKey, majorUnits, returnView } from './view-model'

const product = (id: string) => {
  const found = TEST_PRODUCTS.find((p) => p.id === id)
  if (!found) throw new Error(id)
  return found
}
const settled = (overrides: Partial<CheckoutFacts> = {}): CheckoutFacts => ({
  productId: 'pro_monthly',
  settled: true,
  abandoned: false,
  method: 'card',
  amount: { minor: 4990, currency: 'usd' },
  card: { brand: 'visa', last4: '4242' },
  receiptUrl: 'https://pay.stripe.com/receipts/x',
  renewsAt: '2026-12-06T00:00:00.000Z',
  ...overrides,
})
const balance = { paid: 135, free: 3 }

// comps-v3-b checkout.html (T43): every one of the nine products, success and pending.
describe('checkout return view', () => {
  it('adds the product credits and shows the whole balance', () => {
    const view = returnView(settled(), product('pro_monthly'), balance)
    expect(view).toMatchObject({ state: 'success', kind: 'plan', tier: 'pro', credits: 135, balance: 138, fine: 'fineMonthly' })
    expect(view.state === 'success' && view.renews).toEqual({ at: '2026-12-06T00:00:00.000Z', priceUsd: 49.9 })
  })

  it.each([
    ['starter_monthly', 50, 'fineMonthly'],
    ['pro_monthly', 135, 'fineMonthly'],
    ['max_monthly', 280, 'fineMonthly'],
    ['starter_yearly', 600, 'fineYearly'],
    ['pro_yearly', 1620, 'fineYearly'],
    ['max_yearly', 3360, 'fineYearly'],
    ['pack_s', 20, 'finePack'],
    ['pack_m', 55, 'finePack'],
    ['pack_l', 115, 'finePack'],
  ] as const)('%s: +%i credits, %s', (id, credits, fine) => {
    const p = product(id)
    const pack = p.tier === 'pack'
    const view = returnView(settled({ productId: id, renewsAt: pack ? null : '2027-11-06T00:00:00.000Z' }), p, balance)
    expect(view).toMatchObject({ state: 'success', credits, fine, kind: pack ? 'pack' : 'plan' })
    expect(view.state === 'success' && view.renews === null).toBe(pack)
  })

  it('a plan paid once (Alipay, Waffo) does not renew and says so', () => {
    const view = returnView(settled({ method: 'alipay', card: null, renewsAt: null }), product('max_yearly'), balance)
    expect(view).toMatchObject({ state: 'success', renews: null, fine: 'finePeriod', interval: 'year' })
    expect(fineKey({ kind: 'plan', tier: 'pro', interval: 'month', credits: 135 }, false)).toBe('finePeriod')
  })

  it('pending until the payments row exists, with the session amount or the list price', () => {
    const view = returnView(settled({ settled: false, method: 'alipay' }), product('pro_monthly'), balance)
    expect(view).toEqual({ state: 'pending', kind: 'plan', tier: 'pro', interval: 'month', credits: 135, amount: { minor: 4990, currency: 'usd' }, method: 'alipay' })
    const waffo = returnView(settled({ settled: false, amount: null, method: null }), product('pack_m'), balance)
    expect(waffo).toMatchObject({ state: 'pending', kind: 'pack', amount: { minor: 2490, currency: 'usd' } })
  })

  it('formats amounts in their own currency and names the card brand', () => {
    expect(majorUnits({ minor: 4990, currency: 'usd' })).toBe(49.9)
    expect(majorUnits({ minor: 7200, currency: 'JPY' })).toBe(7200)
    expect(brandName('visa')).toBe('Visa')
    expect(brandName('american_express')).toBe('American Express')
  })
})
