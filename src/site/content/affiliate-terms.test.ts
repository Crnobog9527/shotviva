import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

import { privateDoc } from '../../../tests/support/private-docs'
import { affiliateAgreement } from './affiliate-terms'

// Compare the complete public text to the approved review copy, excluding Markdown styling.
// The approved review copy lives in the private docs repo (tests/support/private-docs.ts); skipped where absent.
const reviewPath = privateDoc('docs', 'review', 'affiliate-agreement-draft.md')
const sections = reviewPath ? readFileSync(reviewPath, 'utf8').split(/^## .+$/m) : []

it.skipIf(!reviewPath).each([['zh', 1], ['en', 2]] as const)('publishes the approved seven clauses in %s under a fresh version', (locale, section) => {
  const approved = sections[section].trim().replaceAll('**', '').replaceAll('`', '')
  expect(approved.split('\n\n')).toHaveLength(7)
  expect(affiliateAgreement(locale)).toEqual({ affiliateAgreement: { version: '2026-11-10', body: approved } })
})
