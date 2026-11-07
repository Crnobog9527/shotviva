import { describe, expect, it } from 'vitest'

import { loadPayment, methodsQuery, productPicksQuery } from './payment'
import { fakeRun, WEEK } from './test-samples'

describe('付款环节 queries', () => {
  it('ties a pick to a checkout of the same product by the same person', () => {
    const { query } = productPicksQuery(WEEK)
    expect(query).toContain("event IN ('paywall_select', 'checkout_start')")
    expect(query).toContain('GROUP BY person_id, product')
  })

  it('groups methods as the Owner reads them: Waffo first, 支付宝 and 微信支付 together', () => {
    const { query } = methodsQuery(WEEK)
    expect(query).toContain("properties.channel = 'waffo', 'waffo'")
    expect(query).toContain("properties.method IN ('alipay', 'alipay_or_wechat', 'wechat_pay', 'wechat'), 'alipay_wechat'")
    expect(query).toContain("'checkout_cancel'")
  })
})

describe('loadPayment (recorded answers)', () => {
  it('reports picks, the share who went to pay, success per method against the period before, and cancels', async () => {
    const payment = await loadPayment(fakeRun(), WEEK)
    expect(payment.picks[0]).toEqual({ productId: 'pro_yearly', picks: 140, pickers: 96, wentToPay: 41, payRate: 41 / 96 })
    expect(payment.methods.map((row) => row.method)).toEqual(['card', 'cn_card', 'alipay_wechat', 'waffo'])
    expect(payment.methods[0]).toEqual({
      method: 'card',
      current: { started: 60, paid: 38, payRate: 38 / 60 },
      previous: { started: 50, paid: 30, payRate: 30 / 50 },
    })
    // No Waffo checkouts: zeros and no rate, not a missing row.
    expect(payment.methods[3]).toEqual({ method: 'waffo', current: { started: 0, paid: 0, payRate: null }, previous: { started: 0, paid: 0, payRate: null } })
    expect(payment.cancels).toEqual({ current: 17, previous: 10 })
  })
})
