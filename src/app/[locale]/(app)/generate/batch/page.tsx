import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { effectiveTier, limitsFor, readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { cachedWebTemplates } from '@/core/templates'
import { MatrixWorkspace, toCatalogueTemplate } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.matrix'))('metaTitle') }
}

function Nav({ aside }: { aside?: ReactNode }) {
  const t = useTranslations('app')
  return <FlowNav back={{ href: '/generate', label: t('workspace.back') }} title={t('matrix.title')} aside={aside} />
}

// Several templates × several photos (T107, Max only), a flow page like the workspace.
// ?t=a,b opens with those templates chosen (from a template's workspace or "Use on more photos").
async function Matrix({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/generate/batch')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const [query, found, balance, tier] = await Promise.all([
    searchParams,
    cachedWebTemplates(await currentLocale(), false),
    readBalance(supabase, user.id),
    // effective_tier() (an unbanned admin counts as Max) is service-role only; the user's own id comes from the session.
    effectiveTier(admin, user.id),
  ])
  const templates = found.map(toCatalogueTemplate).filter((template) => template.photoInput !== 'none')
  const wanted = typeof query.t === 'string' ? query.t.split(',') : []
  const initial = [...new Set(wanted)].filter((id) => templates.some((template) => template.id === id)).slice(0, 5)
  return (
    <>
      <Nav aside={<BalanceChip balance={balance} />} />
      <MatrixWorkspace templates={templates} initial={initial} balance={balance} tier={tier} limit={limitsFor(tier).concurrency} />
    </>
  )
}

export default function MatrixPage({ searchParams }: PageProps<'/[locale]/generate/batch'>) {
  return (
    <AppPage wide>
      <Suspense fallback={<Nav />}>
        <Matrix searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
