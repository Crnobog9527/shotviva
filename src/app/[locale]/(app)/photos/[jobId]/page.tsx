import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, BalanceChip, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { currentTier, limitsFor, readBalance } from '@/core/billing'
import { currentLocale } from '@/core/i18n/server'
import { fileUrlFor, findOwnJob, hasInputPreview, jobRefOrShort, keptInputsOf, originalUrlFor, type Job } from '@/core/jobs'
import { r2Store } from '@/core/storage'
import { EDIT_TEMPLATE_ID, listTemplatesIn, loadEditOffer } from '@/core/templates'
import { DeleteWork, EditFlow, EditTrigger, editDisplay, editOriginal, ResultView, toPhotoDetail } from '@/modules/image'
import { site } from '@/site/site.config'

import { deleteWorkAction } from './actions'

// The balance on the right (B comp photo.html .nav .bal): an edit or Make again spends from it.
function Nav({ title, aside }: { title: string; aside?: ReactNode }) {
  const t = useTranslations('app.result')
  return <FlowNav back={{ href: '/photos', label: t('back') }} title={title} aside={aside} underTabBar />
}

// Everything the page reads besides the job, in one round: templates, the upload preview's HEAD
// (T32), for editing (T30) the source work, the edit offer, balance and tier, and the reference
// number (T78; whether another job shares its first 8 characters is a service-role question,
// and a failed read falls back to the first 8 characters rather than failing the page).
async function loadAround(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string, job: Job) {
  const locale = await currentLocale()
  const admin = createAdminSupabase()
  const [templates, kept, parent, offer, balance, tier, reference] = await Promise.all([
    listTemplatesIn(supabase, locale),
    // An edit has no upload of its own (T30).
    job.templateId === EDIT_TEMPLATE_ID ? false : hasInputPreview(r2Store(), job),
    job.parentJobId ? findOwnJob(supabase, userId, job.parentJobId) : null,
    loadEditOffer(supabase),
    readBalance(supabase, userId),
    // current_tier() is service-role only; the user's own id comes from the session.
    currentTier(admin, userId),
    jobRefOrShort(admin, job.id),
  ])
  return { templates, kept, parent, offer, balance, tier, reference }
}

// One finished photo, a flow page pushed from Photos: the result, the upload's preview and the
// user's note (T32), Share, and Edit when editing is on (ARCHITECTURE §5.2). An edit shows the
// work it came from and the words it used.
async function Result({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const user = await requireUser(`/photos/${jobId}`)
  const supabase = await createServerSupabase()
  const job = await findOwnJob(supabase, user.id, jobId)
  if (!job || job.status !== 'succeeded') notFound()
  const { templates, kept, parent, offer, balance, tier, reference } = await loadAround(supabase, user.id, job)
  const t = await getTranslations('app')
  const lookup = new Map(templates.map((tpl) => [tpl.id, { name: tpl.name, cover: tpl.coverAfterUrl }]))
  const names = { fallback: t('photos.fallbackName'), edited: t('photos.editedName'), titleEdited: (name: string) => t('edit.titleEdited', { name }) }
  const { item, source, change } = editDisplay(job, parent, lookup, names, fileUrlFor)
  const detail = { ...toPhotoDetail(job, kept ? originalUrlFor(job.id) : null, keptInputsOf(job).length > 0), reference }
  const view = (
    <ResultView
      item={item}
      detail={job.templateId === EDIT_TEMPLATE_ID ? { ...detail, original: editOriginal(source) } : detail}
      edit={offer ? <EditTrigger /> : null}
      parent={source ? { id: source.id, fileUrl: source.fileUrl as string, name: source.templateName } : null}
      // findOwnJob leaves out a deleted work (T41), so a parent id with no parent row means deleted.
      parentDeleted={job.parentJobId !== null && parent === null}
      remove={<DeleteWork action={deleteWorkAction.bind(null, job.id)} />}
      change={change}
      shareText={t('result.shareText', { brand: site.brand.name, url: `https://${site.brand.domain}/?utm_source=share&utm_medium=web_share` })}
    />
  )
  return (
    <>
      <Nav title={item.templateName} aside={<BalanceChip balance={balance} />} />
      {offer ? (
        <EditFlow
          source={{ id: job.id, fileUrl: item.fileUrl as string, name: item.templateName, aspect: item.aspect, resolution: item.resolution }}
          balance={balance}
          creditsCost={offer.creditsCost}
          concurrency={limitsFor(tier).concurrency}
        >
          {view}
        </EditFlow>
      ) : (
        view
      )}
    </>
  )
}

export default function ResultPage({ params }: PageProps<'/[locale]/photos/[jobId]'>) {
  return (
    <AppPage wide>
      <Suspense fallback={<Nav title="" />}>
        <Result params={params} />
      </Suspense>
    </AppPage>
  )
}
