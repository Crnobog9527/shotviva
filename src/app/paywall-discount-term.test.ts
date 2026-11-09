import { createTranslator } from 'next-intl'
import { expect, it } from 'vitest'

import { discountTerm } from '@/core/billing/paywall'
import en from '@/site/messages/en.json'
import zh from '@/site/messages/zh.json'

it.each([
  [3, 'First annual payment', '首笔年费'],
  [12, 'First annual payment', '首笔年费'],
  [13, 'First 2 annual payments', '前 2 笔年费'],
] as const)('names the annual invoices covered by a %i-month window', (months, english, chinese) => {
  const term = discountTerm({ duration: 'repeating', months }, false, 'year')
  expect(term.key).toBe('codeAnnualPayments')
  const translate = (locale: 'en' | 'zh') =>
    createTranslator({ locale, messages: locale === 'zh' ? zh.paywall : en.paywall })('codeAnnualPayments', { count: term.values?.count ?? 0 })
  expect(translate('en')).toBe(english)
  expect(translate('zh')).toBe(chinese)
})

it('keeps monthly subscriptions in months and manual wallet payments in one payment', () => {
  const offer = { duration: 'repeating', months: 3 } as const
  expect(discountTerm(offer, false, 'month')).toEqual({ key: 'codeMonths', values: { months: offer.months } })
  expect(discountTerm(offer, true, 'year')).toEqual({ key: 'codeOnce' })
})
