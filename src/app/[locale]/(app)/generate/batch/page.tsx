import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { effectiveTier, limitsFor, readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { GuideButton, loadBatchCatalogue, MatrixWorkspace } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.matrix'))('metaTitle') }
}

function Nav({ aside }: { aside?: ReactNode }) {
  const t = useTranslations('app')
  return <FlowNav back={{ href: '/generate', label: t('workspace.back') }} title={t('matrix.title')} aside={aside} />
}

// Batch create as a page (T107): the fallback deep link of the dialog Create opens (Owner
// 2026-11-12: nothing in the app links here any more). One template on many photos (Pro, Max)
// or several templates × photos (Max), with "See how it works" in its bar.
// ?t=a,b opens with those templates chosen (from a template's dialog or workspace); the form
// keeps as many as the plan holds.
async function Matrix({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser('/generate/batch')
  const supabase = await createServerSupabase()
  const admin = createAdminSupabase()
  const query = await searchParams
  const [{ templates, initial }, balance, tier] = await Promise.all([
    // Series members included: a series dialog's link arrives with a member's id (?t=).
    loadBatchCatalogue(await currentLocale(), query.t),
    readBalance(supabase, user.id),
    // effective_tier() (an unbanned admin counts as Max) is service-role only; the user's own id comes from the session.
    effectiveTier(admin, user.id),
  ])
  return (
    <>
      <Nav
        aside={
          <>
            <GuideButton tier={tier} />
            <BalanceChip balance={balance} />
          </>
        }
      />
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
