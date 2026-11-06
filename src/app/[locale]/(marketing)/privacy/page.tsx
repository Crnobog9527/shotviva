import type { Metadata } from 'next'

import { LegalRoute, legalMetadata } from '../legal-route'

export const metadata: Metadata = legalMetadata('privacy')

export default function PrivacyPage() {
  return <LegalRoute which="privacy" />
}
