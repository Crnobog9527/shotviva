import type { Metadata } from 'next'

import { LegalRoute, legalMetadata } from '../legal-route'

export const metadata: Metadata = legalMetadata('acceptableUse')

export default function AcceptableUsePage() {
  return <LegalRoute which="acceptableUse" />
}
