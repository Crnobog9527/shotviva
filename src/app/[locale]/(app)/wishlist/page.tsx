import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { Link } from '@/core/i18n/ui'
import { r2Store } from '@/core/storage'
import { buttonVariants } from '@/core/ui/button'
import { isWishlistEligible, listWall } from '@/core/wishlist'
import { SentNotice, WallView, WishlistGuide } from '@/core/wishlist/ui'

import { loadWallPage } from './actions'
import { markWishlistSeen } from './onboarding-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.wishlist'))('title') }
}

function Header() {
  const t = useTranslations('app.wishlist')
  const mine = (
    <Link href="/wishlist/mine" className={buttonVariants({ variant: 'glass', size: 'touch', className: 'rounded-full px-4 text-caption' })}>
      {t('myRequests')}
    </Link>
  )
  return <TabRootHeader title={t('title')} aside={mine} lede={t('lede')} />
}

// The wall (B comp wishlist.html): the first page renders here, later pages through the action.
// The account's first visit also gets the teaching sheet (onboarding.wishlistSeen, Owner
// 2026-11-10), which marks itself seen.
async function Wall() {
  const user = await requireUser('/wishlist')
  await connection()
  const [first, eligible] = await Promise.all([
    listWall(await createServerSupabase(), r2Store()),
    // wishlist_eligible() is service-role only; the user's own id comes from the session.
    isWishlistEligible(createAdminSupabase(), user.id),
  ])
  return (
    <>
      <WallView first={first} eligible={eligible} now={new Date().toISOString()} loadMore={loadWallPage} />
      {user.onboarding.wishlistSeen ? null : <WishlistGuide eligible={eligible} markSeen={markWishlistSeen} />}
    </>
  )
}

export default function WishlistPage() {
  return (
    <AppPage wide>
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
