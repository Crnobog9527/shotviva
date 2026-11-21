import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { privateDoc } from '../../../tests/support/private-docs'
import { en } from './affiliate-agreement/en'
import { zh } from './affiliate-agreement/zh'
import { affiliateAgreement } from './affiliate-terms'

// Compare the complete public text to the approved review copy, excluding Markdown styling.
// The approved review copy lives in the private docs repo (tests/support/private-docs.ts); skipped where absent.
const reviewPath = privateDoc('docs', 'review', 'affiliate-agreement-draft.md')
const sections = reviewPath ? readFileSync(reviewPath, 'utf8').split(/^## .+$/m) : []

it.skipIf(!reviewPath).each([['zh', 1], ['en', 2]] as const)('publishes the approved seven clauses in %s under a fresh version', (locale, section) => {
  const approved = sections[section].trim().replaceAll('**', '').replaceAll('`', '')
  expect(approved.split('\n\n')).toHaveLength(7)
  expect(affiliateAgreement(locale).affiliateAgreement).toMatchObject({ version: '2026-11-21', body: approved })
})

it.each([['zh', zh], ['en', en]] as const)('keeps the 2026-11-10 text readable in %s while operations still use it', (locale, text) => {
  expect(affiliateAgreement(locale).affiliateAgreement?.earlier).toEqual({ '2026-11-10': text })
})

it.each(['zh', 'en'] as const)('states the fee deduction in clauses 3 and 5 in %s', (locale) => {
  const body = affiliateAgreement(locale).affiliateAgreement?.body ?? ''
  const [, , three, , five] = body.split('\n\n')
  expect(three).toMatch(locale === 'zh' ? /支付手续费/ : /processing fees/)
  expect(three).toMatch(/Waffo/)
  expect(five).toMatch(locale === 'zh' ? /原支付手续费不因退款减少/ : /not reduced by a refund/)
})
