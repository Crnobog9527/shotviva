import { describe, expect, it } from 'vitest'

import { paymentSource, stripeDashboardUrl } from './source'

const ids = { stripe_session_id: null, stripe_invoice_id: null, stripe_charge_id: null, waffo_order_id: null, product_id: 'pro_monthly', method: 'card' }

describe('payment source', () => {
  it('reads the form off which ids the payment has, and links the charge first', () => {
    expect(paymentSource({ ...ids, channel: 'stripe', stripe_session_id: 'cs_test_a1', stripe_charge_id: 'ch_1' })).toEqual({
      channel: 'stripe',
      form: 'checkout',
      providerId: 'ch_1',
    })
    expect(paymentSource({ ...ids, channel: 'stripe', stripe_invoice_id: 'in_1' })).toEqual({ channel: 'stripe', form: 'renewal', providerId: 'in_1' })
    expect(paymentSource({ ...ids, channel: 'stripe', stripe_session_id: 'cs_test_a2' })).toMatchObject({ form: 'checkout', providerId: 'cs_test_a2' })
    expect(paymentSource({ ...ids, channel: 'waffo', waffo_order_id: 'wf-9', method: 'alipay' })).toEqual({ channel: 'waffo', form: 'waffo', providerId: 'wf-9' })
  })

  // T50 / T66: a Waffo card membership is a subscription; each charge says so (the old Starter
  // and the new Pro after an upgrade both show as subscription charges, each with its order id).
  it('reads Waffo card memberships as subscription charges, Alipay periods and packs as one-time', () => {
    expect(paymentSource({ ...ids, channel: 'waffo', waffo_order_id: 'ORD_starter', product_id: 'starter_monthly' })).toEqual({ channel: 'waffo', form: 'waffo_subscription', providerId: 'ORD_starter' })
    expect(paymentSource({ ...ids, channel: 'waffo', waffo_order_id: 'ORD_pro' })).toMatchObject({ form: 'waffo_subscription', providerId: 'ORD_pro' })
    expect(paymentSource({ ...ids, channel: 'waffo', waffo_order_id: 'ORD_a', method: 'alipay' })).toMatchObject({ form: 'waffo' })
    expect(paymentSource({ ...ids, channel: 'waffo', waffo_order_id: 'ORD_p', product_id: 'pack_m' })).toMatchObject({ form: 'waffo' })
  })

  it('links to Stripe test paths except in production', () => {
    expect(stripeDashboardUrl('cs_test_a1', false)).toBe('https://dashboard.stripe.com/test/search?query=cs_test_a1')
    expect(stripeDashboardUrl('sub_1', true)).toBe('https://dashboard.stripe.com/search?query=sub_1')
  })
})
