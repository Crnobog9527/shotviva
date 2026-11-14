import { Suspense } from 'react'
import { TermsScreen } from '@/core/affiliate/partners'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TermsScreen />
    </Suspense>
  )
}
