import { Suspense } from 'react'
import { EnrollmentScreen, ProgramIntro } from '@/core/affiliate/partners'
import type { SearchParams } from '@/core/affiliate/partners'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<ProgramIntro loading />}>
      <EnrollmentScreen search={searchParams} />
    </Suspense>
  )
}
