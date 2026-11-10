import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DecidePayout } from './payout-decision'
import type { Payout } from './read'

const issued: Payout = {
  id: '10', created_at: '2026-11-01', period: '2026-11-01', affiliate_user_id: 'test',
  status: 'due', amount: 1645, payable: 1496, paid_amount: null, legacy_review_required: false,
  payout_snapshot: {}, paid_at: null, paid_reference: null, note: null, paid_method: null,
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
