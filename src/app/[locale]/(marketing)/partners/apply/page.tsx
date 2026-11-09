import { Suspense } from 'react'
import { ApplyScreen } from '@/core/affiliate/partners'
import type { SearchParams } from '@/core/affiliate/partners'

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={null}>
      <ApplyScreen search={searchParams} />
    </Suspense>
  )
}
