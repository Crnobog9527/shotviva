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
      productId: 'pro_yearly',
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

  it('several rows: the renewing one wins over a cancelling one with a later end, else the newest', () => {
    const cancelling = row({ stripeSubscriptionId: 'sub_old', productId: 'max_yearly', currentPeriodEnd: days(300), cancelAtPeriodEnd: true })
    const renewing = row({ stripeSubscriptionId: 'sub_new', productId: 'starter_monthly', currentPeriodEnd: days(30) })
    expect(summarize([cancelling, renewing], days(300))).toMatchObject({ tier: 'starter', state: 'active', periodEnd: days(30) })
    const pastDue = row({ stripeSubscriptionId: 'sub_late', productId: 'pro_monthly', status: 'past_due', currentPeriodEnd: days(5) })
    expect(summarize([cancelling, pastDue], days(300))).toMatchObject({ tier: 'max', state: 'cancels', periodEnd: days(300) })
    expect(summarize([row({ status: 'canceled', currentPeriodEnd: days(400) }), pastDue], days(5))).toMatchObject({ tier: 'pro', state: 'past_due' })
  })

})

describe('summarizeSubscription with several rows (T66)', () => {
  // After an upgrade (T66) the old plan's row stays next to the new one. Codex's Waffo run
  // (2026-11-07): old Starter cancelling, current Pro then cancelled by the member, both ending
  // the same day; the card said "Starter cancelled". The current tier's row wins, on both
  // providers, whatever the row order.
  it.each(['stripe', 'waffo'] as const)('after an upgrade the card shows the current plan (%s)', (provider) => {
    const ids = (n: string) => (provider === 'stripe' ? { stripeSubscriptionId: `sub_${n}`, waffoOrderId: null } : { stripeSubscriptionId: null, waffoOrderId: `ORD_${n}` })
    const end = days(30)
    const oldStarter = row({ provider, ...ids('starter'), productId: 'starter_monthly', currentPeriodEnd: end, cancelAtPeriodEnd: true })
    const pro = row({ provider, ...ids('pro'), productId: 'pro_monthly', currentPeriodEnd: end })
    const proCancelled = { ...pro, cancelAtPeriodEnd: true }
    for (const rows of [[oldStarter, proCancelled], [proCancelled, oldStarter]]) {
      expect(summarize(rows, end, 'pro')).toMatchObject({ provider, tier: 'pro', interval: 'month', state: 'cancels' })
    }
    // The old row still renewing (its cancel failed and is alerted): the card still shows Pro.
    const oldRenewing = { ...oldStarter, cancelAtPeriodEnd: false }
    expect(summarize([oldRenewing, proCancelled], end, 'pro')).toMatchObject({ tier: 'pro', state: 'cancels' })
    expect(summarize([oldRenewing, pro], end, 'pro')).toMatchObject({ tier: 'pro', state: 'active' })
    // Three plans deep (Starter → Pro → Max): Max.
    const max = row({ provider, ...ids('max'), productId: 'max_yearly', currentPeriodEnd: days(365) })
    expect(summarize([oldStarter, { ...proCancelled }, max], days(365), 'max')).toMatchObject({ tier: 'max', interval: 'year', state: 'active' })
  })

  it('without a current tier (paid_until run out), the renewing row, then the higher plan', () => {
    const starter = row({ stripeSubscriptionId: 'sub_s', productId: 'starter_monthly', status: 'past_due', currentPeriodEnd: days(-1) })
    const pro = row({ stripeSubscriptionId: 'sub_p', productId: 'pro_monthly', status: 'past_due', currentPeriodEnd: days(-1) })
    expect(summarize([starter, pro], days(-1))).toMatchObject({ tier: 'pro', state: 'past_due', expired: true })
  })
})

describe('summarizeSubscription, single states', () => {
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
