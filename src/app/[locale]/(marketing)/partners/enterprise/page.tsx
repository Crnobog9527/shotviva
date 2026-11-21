import { Suspense } from 'react'
import { EnterpriseScreen } from '@/core/affiliate/partners'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EnterpriseScreen />
    </Suspense>
  )
}
