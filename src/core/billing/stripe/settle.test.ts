import type Stripe from 'stripe'
import { describe, expect, it } from 'vitest'

import { subscriptionState } from './settle'

const END = 1_796_565_868 // the current period's end, unix seconds
const sub = (patch: Partial<Stripe.Subscription>): Stripe.Subscription =>
  ({ id: 'sub_1', status: 'active', cancel_at_period_end: false, cancel_at: null, items: { data: [{ current_period_end: END }] }, ...patch }) as unknown as Stripe.Subscription

// What the mirror stores for a Stripe subscription (ARCHITECTURE §6.2). Found in Codex's #165
// validation: a Customer Portal cancel on a flexible-billing subscription sets cancel_at to the
// period end and leaves cancel_at_period_end false, so the account page kept saying "Renews".
describe('subscriptionState', () => {
  it('renews: neither flag set', () => {
    expect(subscriptionState(sub({}))).toEqual({ id: 'sub_1', status: 'active', currentPeriodEnd: new Date(END * 1000), cancelAtPeriodEnd: false })
  })

  it('cancel_at_period_end (classic billing mode) cancels at the period end', () => {
    expect(subscriptionState(sub({ cancel_at_period_end: true }))).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: new Date(END * 1000) })
  })

  it('cancel_at at the period end (Portal, flexible billing mode) also cancels', () => {
    expect(subscriptionState(sub({ cancel_at: END }))).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: new Date(END * 1000) })
  })

  it('cancel_at earlier in the period: the plan ends then', () => {
    expect(subscriptionState(sub({ cancel_at: END - 86_400 }))).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEnd: new Date((END - 86_400) * 1000) })
  })

  it('cancel_at in a later period: this period still renews', () => {
    expect(subscriptionState(sub({ cancel_at: END + 40 * 86_400 }))).toMatchObject({ cancelAtPeriodEnd: false, currentPeriodEnd: new Date(END * 1000) })
  })
})
