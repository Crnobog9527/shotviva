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
  // The MiSans licence asks for attribution; it lives here, not in the footer (ARCHITECTURE §17,
  // DESIGN §6.9).
  {
    id: 'third-party-notices',
    heading: 'Third-party notices',
    plain: true,
    blocks: [
      ['This site uses the MiSans font, © Xiaomi. ', { href: '/fonts/misans/LICENSE.pdf', label: 'Read the MiSans font licence' }, '.'],
      // Self-hosted Latin fonts, all under the SIL Open Font License 1.1 (the licence texts ship next to
      // the files: src/app/fonts/OFL-Geist.txt, public/fonts/instrument-serif/OFL.txt).
      [
        'Geist and Geist Mono: Copyright 2024 The Geist Project Authors (',
        { href: 'https://github.com/vercel/geist-font', label: 'github.com/vercel/geist-font' },
        '), licensed under the ',
        { href: 'https://openfontlicense.org', label: 'SIL Open Font License, Version 1.1' },
        '.',
      ],
      [
        'Instrument Serif: Copyright 2022 The Instrument Serif Project Authors (',
        { href: 'https://github.com/Instrument/instrument-serif', label: 'github.com/Instrument/instrument-serif' },
        '), licensed under the ',
        { href: 'https://openfontlicense.org', label: 'SIL Open Font License, Version 1.1' },
        '.',
      ],
    ],
  },
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
    'Please read these Terms carefully. Using free credits means the images you create are shown publicly, and you are responsible for the people and the intellectual property in what you upload (see "Free works, likeness and your responsibility"). You are also responsible for how you use the images you create, including making sure they match what you actually sell (see "AI-made images and using them in your business"). These Terms also limit our liability and choose the courts of Wyoming for disputes.',
  ],
  sections,
})
