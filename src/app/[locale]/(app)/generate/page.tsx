import { orgBalance } from '@/core/billing/pools'
import type { Metadata } from 'next'
import { readPoolChoiceOffer } from '@/core/org'
import { unstable_rethrow } from 'next/navigation'
import { connection } from 'next/server'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, BalanceChipSlot, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { batchLimitsOf, effectiveLimits, featureTierOf } from '@/core/billing'
import { featureAllowed } from '@/core/features'
import { sharedCreateFeatureAccess } from '@/core/features/read'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { logger } from '@/core/logger'
import { POSTER_FEATURE } from '@/core/poster/sets'
import { isWishlistEnabled } from '@/core/wishlist'
import { WishCard } from '@/core/wishlist/ui/wish-card'
import { loadCataloguePayload } from '@/modules/image/create-data'
import { createReturnPath, FavoritesProvider, GatedFeatures, GatedFeaturesPending, GeneratingPill, TEMPLATES_ANCHOR, TemplateCatalogue, type CreateContext } from '@/modules/image/create-page'
import { site } from '@/site/site.config'

import { readCreatePersonalData } from './personal-data'

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
//
// Shown first, then filled in (Owner 2026-11-24, 方案 A): the header, the grid and the wish card
// need nothing about the account, so they are in the route's App Shell, which a tab-bar link
// prefetches; the first tap on Create shows them at once instead of after a request to the server
// (from mainland China a cross-border round trip and more). The account's part (balance, saved
// templates, tier, photos developing, the org pool offer) is one request-time read that streams in
// behind same-sized placeholders; the creation dialogs wait for it, and reserve_credits still
// checks every charge on the server.
type Search = Promise<Record<string, string | string[] | undefined>>

async function readPersonal(searchParams: Search) {
  // Request time only: never part of the App Shell.
  await connection()
  // The proxy already sends a signed-out visitor to sign-in with the full address; this is the
  // page's own fallback, and it keeps an open series (?series=) or poster editor (?poster=) too.
  const user = await requireUser(async () => {
    const { series, poster } = await searchParams
    return createReturnPath(series, poster)
  })
  const admin = createAdminSupabase()
  // Reuse the service-role limits lookup (effective_limits(): tier plus org lift, §6.5) when the
  // poster gate needs the same answer.
  const limitsPromise = effectiveLimits(admin, user.id)
  const posterAllowed = featureAllowed(user.id, POSTER_FEATURE, {
    loadAccess: sharedCreateFeatureAccess,
    tierOf: () => limitsPromise.then(featureTierOf),
  }).catch(() => false)
  const [{ balance, favoriteIds }, limits, runningIds, poolChoice, posters] = await Promise.all([
    createServerSupabase().then((db) => readCreatePersonalData(db, user.id)),
    limitsPromise,
    // RLS hides jobs with private style references. The admin read returns only IDs for this viewer.
    listRunningJobIds(admin, user.id, new Date()),
    // 出图时让员工自选 (§6.5): only for a member holding both kinds of org credits.
    readPoolChoiceOffer(admin, user.id),
    posterAllowed,
  ])
  const batch = batchLimitsOf(limits)
  const create: CreateContext = { balance, tier: limits.tier, batch, concurrency: { limit: limits.concurrency, runningIds }, poolChoice }
  return { chip: poolChoice ? orgBalance(poolChoice) : balance, favoriteIds, tier: limits.tier, batch, create, posters }
}
type Personal = Awaited<ReturnType<typeof readPersonal>>

async function Balance({ personal }: { personal: Promise<Personal> }) {
  return <BalanceChip balance={(await personal).chip} />
}

async function Gated({ personal }: { personal: Promise<Personal> }) {
  const { tier, batch } = await personal
  return <GatedFeatures tier={tier} batch={batch} />
}

// The poster templates join the grid when the account may use the editor (feature dense_poster).
// While the feature has no tier gate it is open to every account, so the grid is the same for
// everyone and stays in the App Shell; with a gate set (/admin/features) it waits for the account.
async function postersFor(personal: Promise<Personal>): Promise<boolean> {
  const access = (await sharedCreateFeatureAccess()).find((row) => row.key === POSTER_FEATURE)
  return access?.minTier ? (await personal).posters : true
}

// The grid's read, from the shared catalogue cache. When it fails while the App Shell is built (a
// slow database during a deploy: the 8 s deadline in core/templates/create-catalogue.ts), the
// grid falls back to request time, as before this page streamed, instead of failing the build.
async function cataloguePayload(personal: Promise<Personal>) {
  const locale = await currentLocale()
  try {
    return await loadCataloguePayload(locale, postersFor(personal))
  } catch (error) {
    // Next's own signals (a part that turns out to need the request) pass through untouched.
    unstable_rethrow(error)
    logger.warn('create.catalogue_shell_read_failed', { error })
    await connection()
    return loadCataloguePayload(locale, postersFor(personal))
  }
}

async function Catalogue({ personal }: { personal: Promise<Personal> }) {
  const [payload, wishlistLive] = await Promise.all([
    cataloguePayload(personal),
    // The grid ends on "Not finding it? Make a wish" while the wishlist is open (cached read).
    isWishlistEnabled(site),
  ])
  return (
    <FavoritesProvider initialIds={personal.then((p) => p.favoriteIds)} signedIn>
      <TemplateCatalogue payload={payload} create={personal.then((p) => p.create)} endCard={wishlistLive ? <WishCard /> : undefined} />
    </FavoritesProvider>
  )
}

export default function CreatePage({ searchParams }: { searchParams: Search }) {
  const personal = readPersonal(searchParams)
  return (
    <AppPage wide>
      <Header
        aside={
          <>
            <GeneratingPill />
            <Suspense fallback={<BalanceChipSlot />}>
              <Balance personal={personal} />
            </Suspense>
          </>
        }
      />
      {/* Batch photos (Pro/Max) and several templates (Max): open for members who have them,
          locked below with an intro first (Owner 2026-11-12). The card is the same size for every
          tier, so the placeholder is the card itself, drawn locked and inert until the tier lands. */}
      <div className="px-(--gutter) pb-2 md:max-w-[880px]">
        <Suspense fallback={<GatedFeaturesPending />}>
          <Gated personal={personal} />
        </Suspense>
      </div>
      <div id={TEMPLATES_ANCHOR} className="scroll-mt-[calc(var(--sat)+8px)] md:scroll-mt-16">
        <Suspense>
          <Catalogue personal={personal} />
        </Suspense>
      </div>
    </AppPage>
  )
}
