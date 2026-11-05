import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, findOwnJob } from '@/core/jobs'
import { listTemplates } from '@/core/templates'
import { ResultView, toPhotoItem } from '@/modules/image'
import { site } from '@/site/site.config'

const BACK = { href: '/photos', label: 'Photos' }

// One finished photo, a flow page pushed from Photos: full-width result and Share.
async function Result({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const user = await requireUser(`/photos/${jobId}`)
  const supabase = await createServerSupabase()
  const job = await findOwnJob(supabase, user.id, jobId)
  if (!job || job.status !== 'succeeded') notFound()
  const templates = await listTemplates(supabase, 'web')
  const lookup = new Map(templates.map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl }]))
  const item = toPhotoItem(job, lookup, fileUrlFor(job.id))
  return (
    <>
      <FlowNav back={BACK} title={item.templateName} />
      <ResultView item={item} shareText={`Made with ${site.brand.name} https://${site.brand.domain}/?utm_source=share&utm_medium=web_share`} />
    </>
  )
}

export default function ResultPage({ params }: PageProps<'/photos/[jobId]'>) {
  return (
    <AppPage>
      <Suspense fallback={<FlowNav back={BACK} title="" />}>
        <Result params={params} />
      </Suspense>
    </AppPage>
  )
}
