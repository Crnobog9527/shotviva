import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { concurrencyLimit, listOwnJobs } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { ImageWorkspace, toCatalogueTemplate, WorkspaceHead } from '@/modules/image'
import { site } from '@/site/site.config'

function Nav({ title, aside }: { title: string; aside?: ReactNode }) {
  const t = useTranslations('app.workspace')
  return <FlowNav back={{ href: '/generate', label: t('back') }} title={title} aside={aside} />
}

// The workspace, a flow page: no tab bar, back to Create, one fixed primary (DESIGN §8.2).
async function Workspace({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const user = await requireUser(`/generate/${templateId}`)
  const supabase = await createServerSupabase()
  const found = (await listTemplates(supabase, 'web')).find((template) => template.id === templateId)
  if (!found) notFound()
  const [balance, limit, own] = await Promise.all([
    readBalance(supabase, user.id),
    concurrencyLimit(supabase, user.id),
    listOwnJobs(supabase, user.id, new Date()),
  ])
  const template = toCatalogueTemplate(found)
  const t = await getTranslations('app.result')
  return (
    <>
      <Nav title={template.name} aside={<BalanceChip balance={balance} />} />
      <WorkspaceHead template={template} />
      <ImageWorkspace
        template={template}
        balance={balance}
        concurrency={{ limit, runningIds: own.running.map((job) => job.id) }}
        shareText={t('shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })}
      />
    </>
  )
}

export default function WorkspacePage({ params }: PageProps<'/generate/[templateId]'>) {
  return (
    <AppPage>
      <Suspense fallback={<Nav title="" />}>
        <Workspace params={params} />
      </Suspense>
    </AppPage>
  )
}
