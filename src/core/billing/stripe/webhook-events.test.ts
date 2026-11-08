import { describe, expect, it } from 'vitest'

import { STRIPE_WEBHOOK_EVENTS, missingWebhookEvents } from './webhook-events'

// What scripts/stripe-setup.ts reports for the Owner to tick in the Stripe Dashboard (T71).
describe('missingWebhookEvents', () => {
  it('names charge.dispute.closed for an endpoint set up before T71', () => {
    const before = STRIPE_WEBHOOK_EVENTS.filter((event) => event !== 'charge.dispute.closed')
    expect(missingWebhookEvents(before)).toEqual(['charge.dispute.closed'])
  })

  it('nothing for a complete endpoint or one that receives every event', () => {
    expect(missingWebhookEvents([...STRIPE_WEBHOOK_EVENTS, 'payout.paid'])).toEqual([])
    expect(missingWebhookEvents(['*'])).toEqual([])
  })

  it('the list is the eight events of ARCHITECTURE §6.3', () => {
    expect(STRIPE_WEBHOOK_EVENTS).toHaveLength(8)
  })
})
