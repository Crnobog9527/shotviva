import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { RenewalReview } from '@/core/support'
import { RenewalPanel } from './renewal-panel'

function render(patch: Partial<RenewalReview>) {
  const review: RenewalReview = { order: 'ORD_sub', payment: 'PAY_review', period: 2, quoted: 19104, charged: 19100,
    tax: 0, currency: 'usd', reason: 'amount_mismatch', resolution: null, period_paid: false, ...patch }
  return renderToStaticMarkup(createElement(RenewalPanel, { ticketId: 'ticket', review, resolve: async () => ({ ok: true } as const) }))
}
it('offers both decisions for a verified receipt and disables settlement once the period is paid', () => {
  expect(render({})).toMatch(/<button(?![^>]* disabled=)[^>]*>核对通过，按合同入账/)
  expect(render({period_paid: true})).toMatch(/<button[^>]* disabled=[^>]*>核对通过，按合同入账/)
  expect(render({period_paid: true})).toMatch(/<button(?![^>]* disabled=)[^>]*>已在 Waffo 退款，关闭/)
})
it('shows the recorded outcome after resolution and hides both actions', () => {
  expect(render({resolution: 'refunded'})).toContain('本笔已确认退款')
  expect(render({resolution: 'settled'})).not.toContain('<button')
})
