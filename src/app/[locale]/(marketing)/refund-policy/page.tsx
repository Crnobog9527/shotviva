import type { Metadata } from 'next'

import { LegalRoute, legalMetadata } from '../legal-route'

export const metadata: Metadata = legalMetadata('refunds')

export default function RefundPolicyPage() {
  return <LegalRoute which="refunds" />
}
