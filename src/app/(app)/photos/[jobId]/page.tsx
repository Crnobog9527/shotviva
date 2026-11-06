import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, findOwnJob } from '@/core/jobs'
import { EDIT_TEMPLATE_ID, listTemplates } from '@/core/templates'
import { ResultView, toPhotoItem } from '@/modules/image'
import { site } from '@/site/site.config'

function Nav({ title }: { title: string }) {
  const t = useTranslations('app.result')
  return <FlowNav back={{ href: '/photos', label: t('back') }} title={title} />
}

// One finished photo, a flow page pushed from Photos: full-width result and Share.
async function Result({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const user = await requireUser(`/photos/${jobId}`)
  const supabase = await createServerSupabase()
  const job = await findOwnJob(supabase, user.id, jobId)
  if (!job || job.status !== 'succeeded') notFound()
  const [templates, parent] = await Promise.all([
    listTemplates(supabase, 'web'),
    job.parentJobId ? findOwnJob(supabase, user.id, job.parentJobId) : null,
  ])
  const t = await getTranslations('app')
  const lookup = new Map(templates.map((tpl) => [tpl.id, { name: tpl.name, cover: tpl.coverAfterUrl }]))
  lookup.set(EDIT_TEMPLATE_ID, { name: t('photos.editedName'), cover: null })
  const item = toPhotoItem(job, lookup, fileUrlFor(job.id), t('photos.fallbackName'))
  return (
    <>
      <Nav title={item.templateName} />
      <ResultView
        item={item}
        parent={parent?.status === 'succeeded' ? { id: parent.id, fileUrl: fileUrlFor(parent.id) } : null}
        shareText={t('result.shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })}
      />
    </>
  )
}

export default function ResultPage({ params }: PageProps<'/photos/[jobId]'>) {
  return (
    <AppPage>
      <Suspense fallback={<Nav title="" />}>
        <Result params={params} />
      </Suspense>
    </AppPage>
  )
}
