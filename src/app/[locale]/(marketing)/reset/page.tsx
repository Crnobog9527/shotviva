import { Suspense } from 'react'

import { ResetRequestForm } from '@/core/auth/ui'

import { resetRequestAction } from '@/app/auth/actions'

async function Reset({ searchParams }: PageProps<'/[locale]/reset'>) {
  const { error } = await searchParams
  return <ResetRequestForm action={resetRequestAction} linkExpired={error === 'link_expired'} />
}

export default function ResetPage(props: PageProps<'/[locale]/reset'>) {
  return (
    <Suspense>
      <Reset {...props} />
    </Suspense>
  )
}
