import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { listFavoriteIdsOrEmpty } from '@/core/favorites'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { listTemplatesIn } from '@/core/templates'
import { isWishlistEnabled } from '@/core/wishlist'
import { WishCard } from '@/core/wishlist/ui/wish-card'
import { FavoritesProvider, GeneratingPill, TemplateCatalogue, toCatalogueTemplate } from '@/modules/image'
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
async function Create() {
  const user = await requireUser('/generate')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [templates, balance, tier, runningIds, favoriteIds, wishlistLive] = await Promise.all([
    listTemplatesIn(supabase, await currentLocale()),
    readBalance(supabase, user.id),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(admin, user.id),
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
      <FavoritesProvider initialIds={favoriteIds} signedIn>
        <TemplateCatalogue
          templates={templates.map(toCatalogueTemplate)}
          create={{ balance, tier, concurrency: { limit: limitsFor(tier).concurrency, runningIds } }}
          endCard={wishlistLive ? <WishCard /> : undefined}
        />
      </FavoritesProvider>
    </>
  )
}

export default function CreatePage() {
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Create />
      </Suspense>
    </AppPage>
  )
}
