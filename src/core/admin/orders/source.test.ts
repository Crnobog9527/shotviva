import { describe, expect, it } from 'vitest'

import { purchaseSource, stripeDashboardUrl } from './source'

describe('purchase source', () => {
  it('reads the channel and form off the idempotency key, like admin_revenue_stats', () => {
    expect(purchaseSource('purchase:cs_test_a1')).toEqual({ channel: 'stripe', form: 'checkout', providerId: 'cs_test_a1' })
    expect(purchaseSource('renewal:in_1Abc')).toEqual({ channel: 'stripe', form: 'renewal', providerId: 'in_1Abc' })
    expect(purchaseSource('purchase:evt-waffo-9')).toEqual({ channel: 'waffo', form: 'waffo', providerId: 'evt-waffo-9' })
  })

  it('links to Stripe test paths except in production', () => {
    expect(stripeDashboardUrl('cs_test_a1', false)).toBe('https://dashboard.stripe.com/test/search?query=cs_test_a1')
    expect(stripeDashboardUrl('sub_1', true)).toBe('https://dashboard.stripe.com/search?query=sub_1')
  })
})
