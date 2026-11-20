import { expect, it } from 'vitest'
import { feeRuleInput } from './fee-rule-input'

function form(fields: Record<string, string | undefined>, methods: string[] = []) {
  const data = new FormData()
  const base = { operation: 'feeRule', label_zh: '提现手续费', label_en: 'Withdrawal fee', kind: 'percent_fixed',
    percent: '3.5', fixed: '0.50', min: '', max: '', effective_from: '2026-12-01', sort_order: '0', active: 'on' }
  for (const [key, value] of Object.entries({ ...base, ...fields })) if (value !== undefined) data.set(key, value)
  for (const method of methods) data.append('payout_methods', method)
  return data
}

it('turns the form into integer basis points and cents with a UTC start', () => {
  expect(feeRuleInput(form({}))).toEqual({
    label_zh: '提现手续费', label_en: 'Withdrawal fee', kind: 'percent_fixed', percent_bp: 350, fixed_cents: 50,
    min_cents: null, max_cents: null, active: true, effective_from: '2026-12-01T00:00:00Z', sort_order: 0, payout_methods: null,
  })
})

it('drops the part the chosen kind does not use and keeps unique methods', () => {
  expect(feeRuleInput(form({ kind: 'fixed', fixed: '25', percent: '9' }, ['bank', 'bank']))).toMatchObject({
    percent_bp: 0, fixed_cents: 2500, payout_methods: ['bank'],
  })
  expect(feeRuleInput(form({ kind: 'percent', fixed: '9', active: undefined }))).toMatchObject({ percent_bp: 350, fixed_cents: 0, active: false })
})

it('rejects a rule with nothing to charge, reversed bounds, unknown methods or bad numbers', () => {
  expect(() => feeRuleInput(form({ kind: 'percent', percent: '0' }))).toThrow()
  expect(() => feeRuleInput(form({ kind: 'percent_fixed', fixed: '' }))).toThrow()
  expect(() => feeRuleInput(form({ min: '5', max: '1' }))).toThrow()
  expect(() => feeRuleInput(form({}, ['cash']))).toThrow()
  expect(() => feeRuleInput(form({ percent: '101' }))).toThrow()
  expect(() => feeRuleInput(form({ fixed: '-1' }))).toThrow()
  expect(() => feeRuleInput(form({ percent: '1.234' }))).toThrow()
  expect(() => feeRuleInput(form({ label_en: ' ' }))).toThrow()
})
