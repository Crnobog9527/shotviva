import { defineLegalPage, type LegalSection } from '@/core/content'

import { privacyCollectSections } from './privacy-collect'
import { privacyPhoneSections } from './privacy-phone'
import { privacyRightsSections } from './privacy-rights'
import { privacyShareSections } from './privacy-share'
import { LAST_UPDATED, contactSection, entity, legalLinks, operatorSentence } from './shared'

// Structure follows Graylum's staging privacy.html; facts are Shotviva's (ARCHITECTURE §8.3,
// §14, §16; phone sign-in T63). Split into four files only to stay under the 300-line rule (AGENTS §3.1).
const sections: readonly [LegalSection, ...LegalSection[]] = [
  ...privacyCollectSections,
  ...privacyPhoneSections,
  ...privacyShareSections,
  ...privacyRightsSections,
  contactSection('this Privacy Policy or your information'),
]

export const privacyPage = defineLegalPage({
  path: legalLinks.privacy.href,
  title: `Privacy Policy | ${entity.site}`,
  description: `What ${entity.site} collects, how long uploaded photos and created images are kept, who we share data with, and your choices.`,
  h1: 'Privacy Policy',
  label: 'Privacy',
  lastUpdated: LAST_UPDATED,
  intro: [
    `${operatorSentence} This policy explains what personal information we collect when you use ${entity.site}, how we use it, and the choices you have.`,
    'The short version:',
    {
      list: [
        'The photos you use to create an image are kept with that image, so you can make it again at any time, and are deleted with it. Photos you upload but do not use are deleted automatically after 7 days. Images you create are kept until you delete them.',
        'Images made with free credits are public. Images made with paid credits are private unless you make them public.',
        'We do not sell your information, we do not use advertising cookies, and our analytics do not use cookies.',
        'We do not use your photos or images to train AI models.',
        'You can delete your account and its data yourself at any time.',
      ],
    },
  ],
  sections,
})
