import { expect, it } from 'vitest'
import { currentLines, groupOrderFees, unrefundedBase, type FeeLine, type OrderPayment } from './order-fees'

const line = (over: Partial<FeeLine>): FeeLine => ({
  payment_id: '1', refund_id: null, revision: 1, line_no: 1, kind: 'acquiring', channel: 'waffo',
  rate_bp: 390, fixed_cents: 50, amount_cents: 100, source: 'estimate', status: 'estimated', ...over,
})
const payment: OrderPayment = { id: '1', channel: 'waffo', method: 'card', amount_total: 5489, amount_tax: 499, amount_refunded: 0, fee_status: 'estimated' }

it('keeps only the latest revision of the charge and of each refund scope', () => {
  const lines = [
    line({ revision: 1, line_no: 1, amount_cents: 300 }),
    line({ revision: 2, line_no: 1, amount_cents: 310, source: 'waffo_settlement', status: 'final' }),
    line({ revision: 2, line_no: 2, kind: 'fx', amount_cents: 20, source: 'waffo_settlement', status: 'final' }),
    line({ revision: 1, line_no: 1, kind: 'refund_fee', refund_id: 'REF_1', amount_cents: 100 }),
  ]
  expect(currentLines(lines).map((l) => [l.refund_id, l.revision, l.line_no])).toEqual([
    [null, 2, 1], [null, 2, 2], ['REF_1', 1, 1],
  ])
})

it('groups lines by payment and never mixes payments', () => {
  const other: OrderPayment = { ...payment, id: '2' }
  const grouped = groupOrderFees([payment, other], [line({ payment_id: '1' }), line({ payment_id: '2', amount_cents: 7 })])
  expect(grouped.get('1')?.lines.map((l) => l.amount_cents)).toEqual([100])
  expect(grouped.get('2')?.lines.map((l) => l.amount_cents)).toEqual([7])
  expect(groupOrderFees([payment], []).get('1')?.lines).toEqual([])
})

it('mirrors the database base: pre-tax paid scaled by the unrefunded share, rounded down', () => {
  expect(unrefundedBase(payment)).toBe(4990)
  expect(unrefundedBase({ ...payment, amount_refunded: 1000 })).toBe(Math.floor((4990 * 4489) / 5489))
  expect(unrefundedBase({ ...payment, amount_refunded: 5489 })).toBe(0)
  expect(unrefundedBase({ ...payment, amount_total: 0, amount_tax: 0 })).toBe(0)
})
