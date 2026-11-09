import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { affiliateAgreement } from './affiliate-terms'

// Compare the complete public text to the approved review copy, excluding Markdown styling.
const review = readFileSync(new URL('../../../docs/review/affiliate-agreement-draft.md', import.meta.url), 'utf8')
const sections = review.split(/^## .+$/m)

it.each([['zh', 1], ['en', 2]] as const)('publishes the approved seven clauses in %s under a fresh version', (locale, section) => {
  const approved = sections[section].trim().replaceAll('**', '').replaceAll('`', '')
  expect(approved.split('\n\n')).toHaveLength(7)
  expect(affiliateAgreement(locale)).toEqual({ affiliateAgreement: { version: '2026-11-10', body: approved } })
})
