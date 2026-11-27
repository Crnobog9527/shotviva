import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DecidePayout } from './payout-decision'
import type { Payout } from './read'

const issued: Payout = {
  id: '10', created_at: '2026-11-01', period: '2026-11-01', affiliate_user_id: 'test',
  status: 'due', amount: 1645, payable: 1496, paid_amount: null, legacy_review_required: false,
  fees: { gross: 1496, fees: 0, net: 1496, lines: [] },
  payout_snapshot: {}, paid_at: null, paid_reference: null, note: null, paid_method: null,
  account: { org_id: null }, paid_fx_cny_per_usd: null, paid_amount_cny_fen: null,
}
function decision(payout: Partial<Payout>) {
  return renderToStaticMarkup(createElement(DecidePayout, { r: { ...issued, ...payout }, action: async () => '' }))
}

it('offers payment of the reviewed amount and sends the same cents with the operator decision', () => {
  const form = decision({})
  expect(form).toContain('14.96')
  expect(form).toContain('name="expected_amount" value="1496"')
  expect(form).toContain('value="hold"')
  expect(form).not.toContain('16.45')
})

it('only permits the hold-and-return path when historical commission ownership is unknown', () => {
  const due = decision({ legacy_review_required: true, payable: null })
  expect(due).toContain('value="hold"')
  expect(due).not.toContain('value="paid"')
  const held = decision({ status: 'held', legacy_review_required: true, payable: null })
  expect(held).toContain('value="return"')
  expect(held).not.toContain('value="forfeit"')
  expect(decision({ status: 'held' })).toContain('value="forfeit"')
})

const rule = {
  id: '3', label_zh: '提现手续费', label_en: 'Withdrawal fee', kind: 'percent_fixed' as const, percent_bp: 350,
  fixed_cents: 50, min_cents: null, max_cents: null, payout_methods: null, effective_from: '2026-11-20T00:00:00Z',
}

it('marks the net as paid and shows each deduction', () => {
  const form = decision({ fees: { gross: 1496, fees: 102, net: 1394, lines: [{ ...rule, amount: 102 }] } })
  expect(form).toContain('提现手续费：US$1.02')
  expect(form).toContain('name="expected_net" value="1394"')
  expect(form).toContain('name="expected_amount" value="1496"')
  expect(form).toContain('按实到金额标记已付 · US$13.94')
})

it('refuses to offer payment when the fees take the whole payout', () => {
  const form = decision({ fees: { gross: 40, fees: 40, net: 0, lines: [{ ...rule, amount: 40 }] }, payable: 40 })
  expect(form).not.toContain('value="paid"')
  expect(form).toContain('实到金额为 0')
  expect(form).toContain('value="hold"')
})

it('shows the recorded deductions on a paid statement', () => {
  const paid = decision({ status: 'paid', paid_amount: 1496, paid_at: '2026-12-02', fees: { gross: 1496, fees: 102, net: 1394, lines: [{ ...rule, amount: 102 }] } })
  expect(paid).toContain('提现手续费：US$1.02')
  expect(paid).toContain('实到金额（美元） US$13.94')
})

it('asks for the day rate and the CNY sent only on an enterprise statement, and shows them once paid', () => {
  expect(decision({})).not.toContain('paid_amount_cny_fen')
  const org = decision({ account: { org_id: '00000000-0000-4000-8000-000000000001' } })
  expect(org).toMatch(/name="paid_fx_cny_per_usd"[^>]*required|required[^>]*name="paid_fx_cny_per_usd"/)
  expect(org).toMatch(/name="paid_amount_cny_fen"[^>]*required|required[^>]*name="paid_amount_cny_fen"/)
  const done = decision({ status: 'paid', paid_at: '2026-11-02', paid_fx_cny_per_usd: 7.1234, paid_amount_cny_fen: 1065600 })
  expect(done).toContain('¥10656.00 @ 7.1234')
})
