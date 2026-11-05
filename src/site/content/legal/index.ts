import type { FooterLink } from '@/core/content'

import { acceptableUsePage } from './acceptable-use'
import { privacyPage } from './privacy'
import { refundPolicyPage } from './refund-policy'
import { termsPage } from './terms'

// Legal pages (T19). Each has its own route under app/(marketing); none is in the keyword
// map CSV, so the global indexing switch renders all of them noindex (AGENTS §9).
export const legalPages = [termsPage, privacyPage, refundPolicyPage, acceptableUsePage] as const

export const footerLinks: readonly FooterLink[] = legalPages.map((page) => ({ href: page.path, label: page.label }))

export { acceptableUsePage, privacyPage, refundPolicyPage, termsPage }
