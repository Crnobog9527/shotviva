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
import { cachedWallFirstPage, isWishlistEligible, listWall, ownVotesAmong } from '@/core/wishlist'
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
//
// Shown first, then filled in (Owner 2026-11-24): the first page as everyone signed in sees it is a
// shared cache (cachedWallFirstPage), so it is in the App Shell a tab-bar link prefetches and the
// first tap shows it at once. The viewer's own part (their votes on that page, whether they may
// post and vote, the teaching sheet) is one request-time read that streams in after it. The
// proxy's sign-in gate still answers before any of this renders.
async function readViewer(ids: string[]) {
  // Request time only: never part of the App Shell.
  await connection()
  const user = await requireUser('/wishlist')
  const [voted, eligible] = await Promise.all([
    createServerSupabase().then((db) => ownVotesAmong(db, ids)),
    // wishlist_eligible() is service-role only; the user's own id comes from the session.
    isWishlistEligible(createAdminSupabase(), user.id),
  ])
  return { voted: [...voted], eligible, guide: !user.onboarding.wishlistSeen }
}

async function Guide({ viewer }: { viewer: ReturnType<typeof readViewer> }) {
  const { guide, eligible } = await viewer
  return guide ? <WishlistGuide eligible={eligible} markSeen={markWishlistSeen} /> : null
}

async function Wall() {
  const shared = await cachedWallFirstPage()
  if (!shared) return <RequestTimeWall />
  const viewer = readViewer(shared.page.items.map((item) => item.id))
  const personal = viewer.then(({ voted, eligible }) => ({ voted, eligible }))
  return (
    <>
      <WallView first={shared.page} now={shared.at} personal={personal} loadMore={loadWallPage} />
      <Suspense>
        <Guide viewer={viewer} />
      </Suspense>
    </>
  )
}

// The wall read at request time, on the viewer's session, as before: when the shared first page
// could not be read (a build without the database key, an outage).
async function RequestTimeWall() {
  const user = await requireUser('/wishlist')
  await connection()
  const [first, eligible] = await Promise.all([
    listWall(await createServerSupabase(), r2Store()),
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
