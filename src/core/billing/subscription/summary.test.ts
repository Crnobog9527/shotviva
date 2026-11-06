import { describe, expect, it } from 'vitest'

import { TEST_PRODUCTS } from '../stripe/test-products'
import { summarizeSubscription, type MirrorRow } from './summary'

// DESIGN §4.5 account Subscription block: which state each mirror / paid_until combination shows.

const now = new Date('2026-11-06T00:00:00Z')
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
const products = TEST_PRODUCTS

function row(patch: Partial<MirrorRow> = {}): MirrorRow {
  return {
    provider: 'stripe',
    stripeSubscriptionId: 'sub_1',
    waffoOrderId: null,
    productId: 'pro_yearly',
    status: 'active',
    currentPeriodEnd: days(300),
    cancelAtPeriodEnd: false,
    ...patch,
  }
}

const summarize = (rows: MirrorRow[], paidUntil: Date | null, tier: 'starter' | 'pro' | 'max' | null = null) =>
  summarizeSubscription({ rows, paidUntil, tier, products, now })

describe('summarizeSubscription', () => {
  it('an active card subscription: tier, period and renewal date', () => {
    expect(summarize([row()], days(300))).toEqual({
      kind: 'subscription',
      provider: 'stripe',
      tier: 'pro',
      interval: 'year',
      state: 'active',
      periodEnd: days(300),
      expired: false,
    })
  })

  it('a Waffo card subscription says so, so the card offers our Cancel button (T50)', () => {
    expect(summarize([row({ provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1' })], days(300))).toMatchObject({ kind: 'subscription', provider: 'waffo', state: 'active' })
    expect(summarize([row({ provider: 'waffo', stripeSubscriptionId: null, waffoOrderId: 'ORD_1', cancelAtPeriodEnd: true })], days(300))).toMatchObject({ provider: 'waffo', state: 'cancels' })
  })

  it('cancelled in the Portal: cancels at period end', () => {
    expect(summarize([row({ cancelAtPeriodEnd: true })], days(300))).toMatchObject({ kind: 'subscription', state: 'cancels', periodEnd: days(300) })
  })

  it('a failed renewal: past due, and expired once paid_until has run out', () => {
    expect(summarize([row({ status: 'past_due', productId: 'starter_monthly' })], days(2))).toMatchObject({
      state: 'past_due',
      tier: 'starter',
      interval: 'month',
      expired: false,
    })
    expect(summarize([row({ status: 'unpaid' })], days(-1))).toMatchObject({ state: 'past_due', expired: true })
  })

  it('the newest live subscription wins over an old cancelled one', () => {
    const old = row({ stripeSubscriptionId: 'sub_old', status: 'canceled', productId: 'max_monthly', currentPeriodEnd: days(-40) })
    const current = row({ stripeSubscriptionId: 'sub_new', productId: 'starter_monthly', currentPeriodEnd: days(20) })
    expect(summarize([old, current], days(20))).toMatchObject({ kind: 'subscription', tier: 'starter' })
  })

  it('an Alipay period: paid until, with its tier', () => {
    expect(summarize([], days(25), 'starter')).toEqual({ kind: 'paid_until', tier: 'starter', paidUntil: days(25) })
  })

  it('a cancelled subscription with time left reads as paid until', () => {
    expect(summarize([row({ status: 'canceled' })], days(5), 'pro')).toEqual({ kind: 'paid_until', tier: 'pro', paidUntil: days(5) })
  })

  it('membership ran out: expired; never paid (or packs only): free', () => {
    expect(summarize([row({ status: 'canceled', currentPeriodEnd: days(-3) })], days(-3))).toEqual({ kind: 'expired', paidUntil: days(-3) })
    expect(summarize([], null)).toEqual({ kind: 'free' })
  })
})
