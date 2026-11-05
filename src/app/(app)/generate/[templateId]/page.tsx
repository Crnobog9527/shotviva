import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { readBalance } from '@/core/billing'
import { concurrencyLimit, listOwnJobs } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { ImageWorkspace, toCatalogueTemplate, WorkspaceHead } from '@/modules/image'
import { site } from '@/site/site.config'

const BACK = { href: '/generate', label: 'Create' }

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
  return (
    <>
      <FlowNav back={BACK} title={template.name} aside={<BalanceChip balance={balance} />} />
      <WorkspaceHead template={template} />
      <ImageWorkspace
        template={template}
        balance={balance}
        concurrency={{ limit, runningIds: own.running.map((job) => job.id) }}
        shareText={`Made with ${site.brand.name} https://${site.brand.domain}/?utm_source=share&utm_medium=web_share`}
      />
    </>
  )
}

export default function WorkspacePage({ params }: PageProps<'/generate/[templateId]'>) {
  return (
    <AppPage>
      <Suspense fallback={<FlowNav back={BACK} title="" />}>
        <Workspace params={params} />
      </Suspense>
    </AppPage>
  )
}
