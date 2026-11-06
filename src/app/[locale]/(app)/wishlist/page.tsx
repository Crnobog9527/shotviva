import type { Metadata } from 'next'
import { Link } from '@/core/i18n/ui'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { isWishlistEligible, listWall } from '@/core/wishlist'
import { SentNotice, WallView } from '@/core/wishlist/ui'

import { loadWallPage } from './actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.wishlist'))('title') }
}

function Header() {
  const t = useTranslations('app.wishlist')
  const mine = (
    <Link href="/wishlist/mine" className="press inline-flex min-h-11 items-center text-label font-semibold text-primary">
      {t('myRequests')}
    </Link>
  )
  return <TabRootHeader title={t('title')} aside={mine} />
}

// The wall (DESIGN §4.7): the first page renders here, later pages through the action.
async function Wall() {
  const user = await requireUser('/wishlist')
  const [first, eligible] = await Promise.all([
    listWall(await createServerSupabase(), r2Store()),
    // wishlist_eligible() is service-role only; the user's own id comes from the session.
    isWishlistEligible(createAdminSupabase(), user.id),
  ])
  return <WallView first={first} eligible={eligible} loadMore={loadWallPage} />
}

export default function WishlistPage() {
  return (
    <AppPage>
      <Header />
      <Suspense>
        <Wall />
      </Suspense>
      <Suspense>
        <SentNotice />
      </Suspense>
    </AppPage>
  )
}
