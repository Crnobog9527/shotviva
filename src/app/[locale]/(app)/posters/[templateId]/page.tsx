import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { effectiveTier, limitsFor, readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { loadStudioTemplate, posterAllowed, PosterStudio } from '@/modules/image/posters'

type RouteProps = { params: Promise<{ templateId: string }> }

// The poster editor (ARCHITECTURE §5.3), a flow page back to the poster list. 404 when the
// dense_poster feature is gated off for this account, and for a template that makes no posters.
async function Studio({ params }: RouteProps) {
  const { templateId } = await params
  const user = await requireUser(`/posters/${templateId}`)
  if (!(await posterAllowed(user.id))) notFound()
  const admin = createAdminSupabase()
  const supabase = await createServerSupabase()
  const [template, balance, tier, t] = await Promise.all([
    loadStudioTemplate(admin, await currentLocale(), templateId), readBalance(supabase, user.id),
    effectiveTier(admin, user.id), getTranslations('app.poster'),
  ])
  if (!template) notFound()
  return (
    <>
      <FlowNav back={{ href: '/posters', label: t('back') }} title={t('title')} aside={<BalanceChip balance={balance} />} />
      <h1 className="px-(--gutter) pt-2 text-caption text-muted-foreground">{template.name}</h1>
      <PosterStudio template={template} balance={balance} concurrency={limitsFor(tier).concurrency} />
    </>
  )
}

export default function PosterStudioPage({ params }: PageProps<'/[locale]/posters/[templateId]'>) {
  return (
    <AppPage>
      <Suspense fallback={null}>
        <Studio params={params} />
      </Suspense>
    </AppPage>
  )
}
