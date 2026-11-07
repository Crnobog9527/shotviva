import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { listFavoriteIds } from '@/core/favorites'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { listTemplatesIn } from '@/core/templates'
import { FavoritesProvider, GeneratingPill, TemplateCatalogue, toCatalogueTemplate } from '@/modules/image'

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
  const [templates, balance, tier, runningIds, favoriteIds] = await Promise.all([
    listTemplatesIn(supabase, await currentLocale()),
    readBalance(supabase, user.id),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(createAdminSupabase(), user.id),
    listRunningJobIds(supabase, user.id, new Date()),
    listFavoriteIds(supabase, user.id),
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
