import { defineLegalPage, type LegalSection } from '@/core/content'

import { LAST_UPDATED, contactSection, entity, legalLinks, operatorSentence } from './shared'
import { termsBillingSections } from './terms-billing'
import { termsGeneralSections } from './terms-general'
import { termsServiceSections } from './terms-service'

// Structure follows Graylum's staging terms.html; the content is Shotviva's own facts.
// Split into three files only to stay under the 300-line rule (AGENTS §3.1).
const sections: readonly [LegalSection, ...LegalSection[]] = [
  ...termsServiceSections,
  ...termsBillingSections,
  ...termsGeneralSections,
  contactSection('these Terms'),
]

export const termsPage = defineLegalPage({
  path: legalLinks.terms.href,
  title: `Terms of Service | ${entity.site}`,
  description: `The terms for using ${entity.site}: accounts, credits, free and paid works, payments and your rights.`,
  h1: 'Terms of Service',
  label: 'Terms',
  lastUpdated: LAST_UPDATED,
  intro: [
    operatorSentence,
    'Please read these Terms carefully. They include a limit on our liability and choose the courts of Wyoming for disputes.',
  ],
  sections,
})
