import type { FooterLink } from '@/core/content'

import { acceptableUsePage } from './acceptable-use'
import { privacyPage } from './privacy'
import { refundPolicyPage } from './refund-policy'
import { termsPage } from './terms'

// Legal pages (T19). Each has its own route under app/(marketing); none is in the keyword
// map CSV, so the global indexing switch renders all of them noindex (AGENTS §9).
export const legalPages = [termsPage, privacyPage, refundPolicyPage, acceptableUsePage] as const

// "Contact" opens Help & feedback's New ticket tab, a dialog on the account page (T27, T68):
// signed out, the login page brings the visitor back to it. The email address stays in the
// footer's operator line.
export const contactLink: FooterLink = { href: '/account?help=new', label: 'Contact' }

export const footerLinks: readonly FooterLink[] = [
  ...legalPages.map((page) => ({ href: page.path, label: page.label })),
  contactLink,
]

export { acceptableUsePage, privacyPage, refundPolicyPage, termsPage }
