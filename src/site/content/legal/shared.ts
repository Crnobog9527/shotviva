import { addressLines } from '@/core/config'
import type { LegalLink, LegalSection } from '@/core/content'

import { site } from '../../site.config'

// Entity facts for the legal text. Pages never spell out the company name, address or
// email themselves; they read them here, from site.config (T19).
const { brand } = site

export const LAST_UPDATED = '2026-11-06'

export const entity = {
  site: brand.name,
  company: brand.legalName,
  email: brand.contactEmail,
  url: `https://${brand.domain}`,
} as const

export const emailLink: LegalLink = { href: `mailto:${brand.contactEmail}`, label: brand.contactEmail }

export const legalLinks = {
  terms: { href: '/terms', label: 'Terms of Service' },
  privacy: { href: '/privacy', label: 'Privacy Policy' },
  refunds: { href: '/refund-policy', label: 'Refund Policy' },
  acceptableUse: { href: '/acceptable-use', label: 'Acceptable Use Policy' },
} as const satisfies Record<string, LegalLink & { href: `/${string}` }>

export const pricingLink: LegalLink = { href: '/pricing', label: 'pricing page' }

// Who we are, in one sentence; opens every page.
export const operatorSentence = `${entity.site} (${brand.domain}) is operated by ${entity.company}, a company registered in ${brand.registeredIn} ("we", "us", "our").`

export function contactSection(about: string): LegalSection {
  return {
    id: 'contact',
    heading: 'Contact us',
    blocks: [
      [`If you have questions about ${about}, email us at `, emailLink, ' or write to:'],
      { lines: [entity.company, ...addressLines(brand.address)] },
    ],
  }
}
