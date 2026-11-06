import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { ResetRequestForm } from '@/core/auth/ui'

import { resetRequestAction } from '@/app/auth/actions'

// Sign-in pages are noindex like the rest of the app (建站规格 R6); the root template adds
// " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.reset'))('title') }
}

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
