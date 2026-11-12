import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { effectiveTier, limitsFor, readBalance } from '@/core/billing'
import { listFavoriteIdsOrEmpty } from '@/core/favorites'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { isWishlistEnabled } from '@/core/wishlist'
import { WishCard } from '@/core/wishlist/ui/wish-card'
import { createReturnPath, FavoritesProvider, GatedFeatures, GeneratingPill, loadCatalogueView, TEMPLATES_ANCHOR, TemplateCatalogue } from '@/modules/image'
import { site } from '@/site/site.config'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.create'))('metaTitle') }
}

function Header({ aside }: { aside?: ReactNode }) {
  const t = useTranslations('app.create')
  return <TabRootHeader title={t('title')} lede={t('lede')} aside={aside} />
}

// Create tab (DESIGN §8.2, B comp create.html): the template catalogue with the balance chip.
// A card opens the creation dialog right here (T38), so the page also reads what the form
// needs: the tier (batch size) and the photos already developing (concurrency), and the user's
// saved templates, read per request on their own session (never in the shared catalogue cache).
type Search = Promise<Record<string, string | string[] | undefined>>

// The proxy already sends a signed-out visitor to sign-in with the full address; this is the
// page's own fallback, and it keeps an open series (?series=) too.
async function Create({ searchParams }: { searchParams: Search }) {
  const user = await requireUser(createReturnPath((await searchParams).series))
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [view, balance, tier, runningIds, favoriteIds, wishlistLive] = await Promise.all([
    // Templates and series cards placed under up to three category levels (T102).
    loadCatalogueView(await currentLocale()),
    readBalance(supabase, user.id),
    // effective_tier() (an unbanned admin counts as Max) is service-role only; the user's own id comes from the session.
    effectiveTier(admin, user.id),
    listRunningJobIds(admin, user.id, new Date()),
    // A failed read degrades to no favorites (logged), never to an error page or signed-out home.
    listFavoriteIdsOrEmpty(supabase, user.id),
    // The grid ends on "Not finding it? Make a wish" while the wishlist is open (cached read).
    isWishlistEnabled(site),
  ])
  return (
    <>
      <Header
        aside={
          <>
            <GeneratingPill />
            <BalanceChip balance={balance} />
          </>
        }
      />
      {/* Batch photos (Pro/Max) and several templates (Max): open for members who have them,
          locked below with an intro first (Owner 2026-11-12). */}
      <div className="px-(--gutter) pb-2 md:max-w-[880px]">
        <GatedFeatures tier={tier} />
      </div>
      <div id={TEMPLATES_ANCHOR} className="scroll-mt-[calc(var(--sat)+8px)] md:scroll-mt-16">
        <FavoritesProvider initialIds={favoriteIds} signedIn>
          <TemplateCatalogue
            view={view}
            create={{ balance, tier, concurrency: { limit: limitsFor(tier).concurrency, runningIds } }}
            endCard={wishlistLive ? <WishCard /> : undefined}
          />
        </FavoritesProvider>
      </div>
    </>
  )
}

export default function CreatePage({ searchParams }: { searchParams: Search }) {
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Create searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
