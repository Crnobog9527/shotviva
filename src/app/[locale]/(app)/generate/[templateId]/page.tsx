import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { listRunningJobIds } from '@/core/jobs'
import { listTemplatesIn, loadEditOffer } from '@/core/templates'
import { r2Store } from '@/core/storage'
import { ImageWorkspace, loadAgain, toCatalogueTemplate, WorkspaceHead } from '@/modules/image'
import { site } from '@/site/site.config'

function Nav({ title, aside }: { title: string; aside?: ReactNode }) {
  const t = useTranslations('app.workspace')
  return <FlowNav back={{ href: '/generate', label: t('back') }} title={title} aside={aside} />
}

type RouteProps = { params: Promise<{ templateId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

// The workspace, a flow page: no tab bar, back to Create, one fixed primary (DESIGN §8.2).
// ?again=<jobId> is Make again from a finished work (T40): its settings and kept photos.
async function Workspace({ params, searchParams }: RouteProps) {
  const [{ templateId }, query] = await Promise.all([params, searchParams])
  const user = await requireUser(`/generate/${templateId}`)
  const supabase = await createServerSupabase()
  const [found] = await listTemplatesIn(supabase, await currentLocale(), { id: templateId })
  if (!found) notFound()
  const template = toCatalogueTemplate(found)
  const againId = typeof query.again === 'string' ? query.again : undefined
  const admin = createAdminSupabase()
  const [balance, tier, runningIds, again, editOffer] = await Promise.all([
    readBalance(supabase, user.id),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(admin, user.id),
    listRunningJobIds(admin, user.id, new Date()),
    loadAgain({ db: admin, store: r2Store }, { userId: user.id, jobId: againId, template }),
    // "Edit this photo" on the done view only when editing is on (T30).
    loadEditOffer(supabase),
  ])
  const t = await getTranslations('app.result')
  return (
    <>
      <Nav title={template.name} aside={<BalanceChip balance={balance} />} />
      <WorkspaceHead template={template} />
      <ImageWorkspace
        template={template}
        balance={balance}
        tier={tier}
        concurrency={{ limit: limitsFor(tier).concurrency, runningIds }}
        again={again}
        editable={editOffer !== null}
        shareText={t('shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })}
      />
    </>
  )
}

export default function WorkspacePage({ params, searchParams }: PageProps<'/[locale]/generate/[templateId]'>) {
  return (
    <AppPage wide>
      <Suspense fallback={<Nav title="" />}>
        <Workspace params={params} searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
