import type { Metadata } from 'next'

import { LegalRoute, legalMetadata } from '../legal-route'

export const metadata: Metadata = legalMetadata('terms')

export default function TermsPage() {
  return <LegalRoute which="terms" />
}
