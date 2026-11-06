import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, findOwnJob, hasInputPreview, originalUrlFor } from '@/core/jobs'
import { r2Store } from '@/core/storage'
import { listTemplates } from '@/core/templates'
import { ResultView, toPhotoDetail, toPhotoItem } from '@/modules/image'
import { site } from '@/site/site.config'

function Nav({ title }: { title: string }) {
  const t = useTranslations('app.result')
  return <FlowNav back={{ href: '/photos', label: t('back') }} title={title} />
}

// One finished photo, a flow page pushed from Photos: the result, the upload's preview and the
// user's note (T32), Share. The preview's existence is one R2 HEAD, run alongside the templates.
async function Result({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const user = await requireUser(`/photos/${jobId}`)
  const supabase = await createServerSupabase()
  const job = await findOwnJob(supabase, user.id, jobId)
  if (!job || job.status !== 'succeeded') notFound()
  const [templates, kept] = await Promise.all([listTemplates(supabase, 'web'), hasInputPreview(r2Store(), job)])
  const t = await getTranslations('app')
  const lookup = new Map(templates.map((tpl) => [tpl.id, { name: tpl.name, cover: tpl.coverAfterUrl }]))
  const item = toPhotoItem(job, lookup, fileUrlFor(job.id), t('photos.fallbackName'))
  return (
    <>
      <Nav title={item.templateName} />
      <ResultView
        item={item}
        detail={toPhotoDetail(job, kept ? originalUrlFor(job.id) : null)}
        shareText={t('result.shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })}
      />
    </>
  )
}

export default function ResultPage({ params }: PageProps<'/photos/[jobId]'>) {
  return (
    <AppPage wide>
      <Suspense fallback={<Nav title="" />}>
        <Result params={params} />
      </Suspense>
    </AppPage>
  )
}
