import { Suspense } from 'react'
import { EnterpriseScreen } from '@/core/affiliate/partners'
import type { SearchParams } from '@/core/affiliate/partners'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={null}>
      <EnterpriseScreen search={searchParams} />
    </Suspense>
  )
}
