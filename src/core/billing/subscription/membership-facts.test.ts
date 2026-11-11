import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { lastMembership, planAllowance } from './membership-facts'
import type { SubscriptionSummary } from './summary'

// The account pass and credit dial (T48): the newest membership purchase, and how many paid
// credits a period of the current plan brings.

const end = new Date('2026-12-06T00:00:00Z')
const sub = (tier: 'starter' | 'pro' | 'max', interval: 'month' | 'year'): SubscriptionSummary => ({
  kind: 'subscription',
  productId: `${tier}_${interval === 'month' ? 'monthly' : 'yearly'}`,
  provider: 'stripe',
  tier,
  interval,
  state: 'active',
  periodEnd: end,
  expired: false,
})

describe('lastMembership', () => {
  it('takes the newest membership purchase and skips packs', () => {
    const payments = [
      { productId: 'pack_l', method: 'card' as const },
      { productId: 'max_yearly', method: 'alipay' as const },
      { productId: 'starter_monthly', method: 'card' as const },
    ]
    expect(lastMembership(payments, TEST_PRODUCTS)).toMatchObject({ product: { id: 'max_yearly' }, method: 'alipay' })
  })

  it('is null with no membership purchase, or an unknown product', () => {
    expect(lastMembership([{ productId: 'pack_s', method: 'card' }], TEST_PRODUCTS)).toBeNull()
    expect(lastMembership([{ productId: 'retired_plan', method: 'card' }], TEST_PRODUCTS)).toBeNull()
    expect(lastMembership([], TEST_PRODUCTS)).toBeNull()
  })
})

describe('planAllowance', () => {
  it('a subscription: the credits of its product per period', () => {
    expect(planAllowance(sub('starter', 'month'), null)).toBeNull()
    const prior = lastMembership([{ productId: 'max_yearly', method: 'card', grantedCredits: 3360 }], TEST_PRODUCTS)
    expect(planAllowance(sub('max', 'year'), prior)).toEqual({ credits: 3360, interval: 'year' })
  })

  it('a one-period member: the last purchase when it is the same tier', () => {
    const wallet: SubscriptionSummary = { kind: 'paid_until', tier: 'pro', paidUntil: end }
    const proMonth = lastMembership([{ productId: 'pro_monthly', method: 'alipay', grantedCredits: 135 }], TEST_PRODUCTS)
    const maxYear = lastMembership([{ productId: 'max_yearly', method: 'alipay' }], TEST_PRODUCTS)
    expect(planAllowance(wallet, proMonth)).toEqual({ credits: 135, interval: 'month' })
    expect(planAllowance(wallet, maxYear)).toBeNull()
    expect(planAllowance(wallet, null)).toBeNull()
  })

  it('no plan, no allowance', () => {
    const last = lastMembership([{ productId: 'starter_monthly', method: 'card' }], TEST_PRODUCTS)
    expect(planAllowance({ kind: 'expired', paidUntil: end }, last)).toBeNull()
    expect(planAllowance({ kind: 'free' }, null)).toBeNull()
  })
})
