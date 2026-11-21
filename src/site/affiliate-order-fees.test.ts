import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'
import { OrderFeeDetail } from '@/core/affiliate/partners/order-fee-detail'
import type { Commission } from '@/core/affiliate/partners/models'
import type { FeeLine, OrderFees } from '@/core/affiliate/partners/order-fees'

const dict = (messages: typeof en) => (key: string, values?: Record<string, unknown>) => {
  const found = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages.affiliate)
  return typeof found === 'string' ? found.replace(/\{count[^}]*\}[^}]*\}|\{count\}/g, String(values?.count ?? '')) : key
}
const translate = (messages: typeof en) =>
  Object.assign(dict(messages), { has: (key: string) => typeof dict(messages)(key) === 'string' && dict(messages)(key) !== key })

const commission = (over: Partial<Commission>): Commission => ({
  id: '9', created_at: '2026-11-21T00:00:00Z', payment_id: '1', product_id: 'pro_monthly', base_usd: 4990,
  fee_cents: 320, net_base_usd: 4670, rate_bp: 1500, amount: 700, status: 'pending', confirm_after: '2026-12-21T00:00:00Z', ...over,
})
const line = (over: Partial<FeeLine>): FeeLine => ({
  payment_id: '1', refund_id: null, revision: 1, line_no: 1, kind: 'acquiring', channel: 'waffo',
  rate_bp: 390, fixed_cents: 50, amount_cents: 245, source: 'estimate', status: 'estimated', ...over,
})
const order: OrderFees = {
  payment: { id: '1', channel: 'waffo', method: 'wechat_pay', amount_total: 5489, amount_tax: 499, amount_refunded: 0, fee_status: 'estimated' },
  lines: [line({}), line({ line_no: 2, kind: 'fx', rate_bp: null, fixed_cents: null, amount_cents: 75, source: 'waffo_settlement', status: 'final' })],
}

it.each([['en', en], ['zh', zh]] as const)('lists every fee line with channel, rate, source and status (%s)', (locale, messages) => {
  const t = translate(messages) as never
  const html = renderToStaticMarkup(createElement(OrderFeeDetail, { row: commission({}), order, locale, t }))
  expect(html).toContain('3.9% + $0.50')
  expect(html).toContain('$2.45')
  expect(html).toContain('$0.75')
  expect(html).toContain(messages.affiliate.orderFees.channels.waffo_wechat_pay)
  expect(html).toContain(messages.affiliate.orderFees.sourceReal)
  expect(html).toContain(messages.affiliate.orderFees.sourceEstimate)
  expect(html).toContain(messages.affiliate.orderFees.state.final)
  expect(html).toContain('$46.70')
})

it('shows the refunded share only when something was refunded', () => {
  const t = translate(en) as never
  const none = renderToStaticMarkup(createElement(OrderFeeDetail, { row: commission({}), order, locale: 'en', t }))
  expect(none).not.toContain('Refunded share')
  const refunded = { ...order, payment: { ...order.payment, amount_refunded: 2000 } }
  const html = renderToStaticMarkup(createElement(OrderFeeDetail, { row: commission({}), order: refunded, locale: 'en', t }))
  expect(html).toContain('Refunded share')
})

it('marks a commission from before fees existed with the old-rule note and no breakdown', () => {
  const t = translate(zh) as never
  const html = renderToStaticMarkup(
    createElement(OrderFeeDetail, { row: commission({ fee_cents: null, net_base_usd: null }), order, locale: 'zh', t }),
  )
  expect(html).toContain('按旧规则计算（未扣手续费）')
  expect(html).not.toContain('<details')
})
