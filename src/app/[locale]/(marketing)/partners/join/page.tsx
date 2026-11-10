import { Suspense } from 'react'
import { EnrollmentScreen } from '@/core/affiliate/partners'
import type { SearchParams } from '@/core/affiliate/partners'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<div className="af-program" aria-busy="true" />}>
      <EnrollmentScreen search={searchParams} mode="join" />
    </Suspense>
  )
}
