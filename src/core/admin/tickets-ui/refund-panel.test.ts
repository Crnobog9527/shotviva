import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AdminPayment } from '@/core/support'

import { PaymentFacts } from './refund-panel'

// The refund screen's provider hint (T27, T50): a Waffo subscription order has one charge per
// period, so the Owner is sent to the charge (PAY_…), and told a refund does not stop renewals.
const payment = (patch: Partial<AdminPayment>): AdminPayment => ({
  id: '1',
  productId: 'pro_monthly',
  channel: 'waffo',
  stripeSessionId: null,
  stripeInvoiceId: null,
  stripeChargeId: null,
  waffoOrderId: 'ORD_sub1',
  waffoPaymentId: 'PAY_2nd',
  amountTotal: 5427,
  amountTax: 437,
  amountRefunded: 0,
  currency: 'usd',
  method: 'card',
  status: 'paid',
  createdAt: '2026-12-06T08:30:00Z',
  creditsClawedBack: 0,
  clawbackShortfall: 0,
  ...patch,
})
const render = (p: AdminPayment) => renderToStaticMarkup(createElement(PaymentFacts, { payment: p, stripeLive: false }))

describe('refund screen, Waffo', () => {
  it('a subscription charge: refund that charge by its PAY_ id, and the subscription is cancelled for us', () => {
    const html = render(payment({}))
    expect(html).toContain('按扣款号 PAY_2nd（订单 ORD_sub1）')
    expect(html).toContain('系统会自动取消这个 Waffo 订阅')
  })

  it('a one-time pack or an Alipay period: no subscription note; old rows fall back to the order id', () => {
    expect(render(payment({ productId: 'pack_s' }))).not.toContain('自动取消这个 Waffo 订阅')
    expect(render(payment({ method: 'alipay' }))).not.toContain('自动取消这个 Waffo 订阅')
    expect(render(payment({ waffoPaymentId: null, productId: 'pack_s' }))).toContain('按订单号 ORD_sub1 搜索并退款')
  })
})
