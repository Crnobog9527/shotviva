import { orgBalance } from '@/core/billing/pools'
import type { Metadata } from 'next'
import { readPoolChoiceOffer } from '@/core/org'
import { connection } from 'next/server'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { BalanceChipSlot } from '@/core/app-shell/balance-chip-slot'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { batchLimitsOf, effectiveLimits, featureTierOf } from '@/core/billing'
import { featureAllowed } from '@/core/features'
import { sharedCreateFeatureAccess } from '@/core/features/read'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { POSTER_FEATURE } from '@/core/poster/sets'
import { isWishlistEnabled } from '@/core/wishlist'
import { WishCard } from '@/core/wishlist/ui/wish-card'
import { cachedPublicCatalogue, loadCataloguePayload, type CataloguePayload } from '@/modules/image/create-data'
import { createReturnPath, DeviceCatalogue, FavoritesProvider, GatedFeatures, GatedFeaturesPending, GeneratingPill, TEMPLATES_ANCHOR, type CreateContext } from '@/modules/image/create-page'
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
// Drawn from the phone first, then filled in (Owner 2026-11-24, after Higgsfield and Lovart): the
// grid comes from the public catalogue file kept on the device (modules/image DeviceCatalogue), so
// a tap on Create shows it at once instead of after a cross-border request; the page's HTML carries
// no catalogue. The account's part (balance, saved templates, tier, photos developing, the org
// pool offer) is one request-time read that streams in behind same-sized placeholders; the
// creation dialogs wait for it, and reserve_credits still checks every charge on the server.
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

// The poster templates are in the public file while dense_poster is open to every account. When
// they are not (a tier gate, invite-only, not yet opened to all), they are entitlement-specific: an
// entitled account gets its own catalogue here, poster templates included. The public file's own
// answer decides, so the two never disagree.
async function entitledCatalogue(personal: Promise<Personal>): Promise<CataloguePayload | null> {
  // The account first: it is request-time, so the reads below never run while the shell is built.
  const { posters } = await personal
  const locale = await currentLocale()
  const publicPosters = (await cachedPublicCatalogue(locale))?.posters === true
  return posters && !publicPosters ? loadCataloguePayload(locale, Promise.resolve(true)) : null
}

async function Balance({ personal }: { personal: Promise<Personal> }) {
  return <BalanceChip balance={(await personal).chip} />
}

async function Gated({ personal }: { personal: Promise<Personal> }) {
  const { tier, batch } = await personal
  return <GatedFeatures tier={tier} batch={batch} />
}

// "Not finding it? Make a wish" while the wishlist is open (a cached setting).
async function WishEnd() {
  return (await isWishlistEnabled(site)) ? <WishCard /> : null
}

export default function CreatePage({ searchParams }: { searchParams: Search }) {
  const personal = readPersonal(searchParams)
  // Rejections reach the parts that await them; these copies only must not go unhandled.
  const entitled = entitledCatalogue(personal).catch(() => null)
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
        <FavoritesProvider initialIds={personal.then((p) => p.favoriteIds)} signedIn>
          <DeviceCatalogue create={personal.then((p) => p.create)} entitled={entitled} endCard={<Suspense><WishEnd /></Suspense>} />
        </FavoritesProvider>
      </div>
    </AppPage>
  )
}
