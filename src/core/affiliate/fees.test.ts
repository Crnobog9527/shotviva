import { expect, it } from 'vitest'
import { feeFormula, feeLabel, feeQuote } from './fees'

const words = {
  money: (c: number) => '$' + (c / 100).toFixed(2),
  percent: (bp: number) => bp / 100 + '%',
  min: (a: string) => 'min ' + a,
  max: (a: string) => 'max ' + a,
}

it('describes each kind with its bounds', () => {
  const base = { percent_bp: 350, fixed_cents: 50, min_cents: null, max_cents: null }
  expect(feeFormula({ ...base, kind: 'percent_fixed' }, words)).toBe('3.5% + $0.50')
  expect(feeFormula({ ...base, kind: 'percent', min_cents: 100, max_cents: 2000 }, words)).toBe('3.5% (min $1.00, max $20.00)')
  expect(feeFormula({ ...base, kind: 'fixed' }, words)).toBe('$0.50')
})

it('picks the label for the locale', () => {
  expect(feeLabel({ label_zh: '电汇费', label_en: 'Wire fee' }, 'zh')).toBe('电汇费')
  expect(feeLabel({ label_zh: '电汇费', label_en: 'Wire fee' }, 'en')).toBe('Wire fee')
})

it('rejects a quote whose net is negative', () => {
  expect(feeQuote.safeParse({ gross: 100, fees: 150, net: -50, lines: [] }).success).toBe(false)
})
