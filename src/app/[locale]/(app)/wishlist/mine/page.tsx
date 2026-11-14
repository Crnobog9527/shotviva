import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
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

function Nav() {
  const t = useTranslations('app.wishlist')
  return <FlowNav back={{ href: '/wishlist', label: t('title') }} title={t('mine.title')} pinnedTitle />
}

// My requests (B comp wishlist.html ?v=mine), a flow page: no tab bar, back to the wall.
async function Mine() {
  const user = await requireUser('/wishlist/mine')
  await connection()
  const first = await listMyRequests(await createServerSupabase(), r2Store(), user.id)
  return <MyRequestsView first={first} now={new Date().toISOString()} loadMore={loadMyRequestsPage} />
}

export default function MyRequestsPage() {
  return (
    <AppPage wide>
      <Nav />
      <Suspense>
        <Mine />
      </Suspense>
    </AppPage>
  )
}
