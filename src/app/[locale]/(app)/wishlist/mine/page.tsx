import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { listMyRequests } from '@/core/wishlist'
import { MyRequestsView } from '@/core/wishlist/ui'

import { loadMyRequestsPage } from '../actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.wishlist.mine'))('title') }
}

function Head() {
  const t = useTranslations('app.wishlist')
  return (
    <>
      <FlowNav back={{ href: '/wishlist', label: t('title') }} title={t('mine.title')} />
      <h1 className="px-4 pt-2 font-display text-h1 leading-tight">{t('mine.title')}</h1>
    </>
  )
}

// My requests, a flow page (DESIGN §4.7): no tab bar, back to the wall.
async function Mine() {
  const user = await requireUser('/wishlist/mine')
  const first = await listMyRequests(await createServerSupabase(), r2Store(), user.id)
  return <MyRequestsView first={first} loadMore={loadMyRequestsPage} />
}

export default function MyRequestsPage() {
  return (
    <AppPage>
      <Head />
      <Suspense>
        <Mine />
      </Suspense>
    </AppPage>
  )
}
