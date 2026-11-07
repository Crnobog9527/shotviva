import { describe, expect, it } from 'vitest'

import { stripeFailureAlert } from './failure-alert'

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const event = (type: string, object: Record<string, unknown>) => ({ id: 'evt_1', type, data: { object } }) as never

describe('stripeFailureAlert', () => {
  it('reads amount, product and user of a checkout session from the event body', () => {
    const session = { id: 'cs_1', amount_total: 1990, currency: 'usd', metadata: { user_id: USER, product_id: 'starter_monthly' } }
    expect(stripeFailureAlert(event('checkout.session.completed', session))).toEqual({
      kind: 'payment_failed',
      channel: 'stripe',
      eventId: 'evt_1',
      step: 'purchase',
      userId: USER,
      productId: 'starter_monthly',
      amount: { cents: 1990, currency: 'usd' },
    })
  })

  it('finds a renewal invoice’s product on its subscription metadata', () => {
    const invoice = {
      id: 'in_1',
      amount_paid: 4990,
      currency: 'usd',
      metadata: {},
      parent: { subscription_details: { metadata: { user_id: USER, product_id: 'pro_monthly' } } },
    }
    expect(stripeFailureAlert(event('invoice.paid', invoice))).toMatchObject({ step: 'renewal', productId: 'pro_monthly', amount: { cents: 4990 } })
  })

  it('names no money for events that grant nothing', () => {
    expect(stripeFailureAlert(event('customer.subscription.updated', { id: 'sub_1', metadata: { user_id: USER } }))).toMatchObject({
      step: 'subscription',
      userId: null,
      productId: null,
      amount: null,
    })
  })
})
