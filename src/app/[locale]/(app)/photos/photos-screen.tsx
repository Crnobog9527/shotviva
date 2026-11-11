import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, listOwnJobs } from '@/core/jobs'
import { currentLocale } from '@/core/i18n/server'
import { EDIT_TEMPLATE_ID, listTemplatesIn } from '@/core/templates'
import { DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

function Header({ aside }: { aside?: ReactNode }) {
  return <TabRootHeader title={useTranslations('app.photos')('title')} aside={aside} />
}

// Photos tab (B comp photos.html): photos still developing, then finished ones. back: where
// sign-in returns to (a work's own address on /photos/[jobId]).
async function Photos({ back }: { back: string | Promise<string> }) {
  const user = await requireUser(await back)
  const supabase = await createServerSupabase()
  const now = new Date()
  const [own, templates] = await Promise.all([listOwnJobs(createAdminSupabase(), user.id, now), listTemplatesIn(supabase, await currentLocale(), { includeSeriesMembers: true })])
  const tp = await getTranslations('app.photos')
  const fallback = tp('fallbackName')
  const lookup: TemplateLookup = new Map(templates.map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  // Edits run on the built-in `edit` template, which is in no catalogue (ARCHITECTURE §5.2).
  lookup.set(EDIT_TEMPLATE_ID, { name: tp('editedName'), cover: null })
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback))
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={done.length} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid items={done} now={now} anyRunning={running.length > 0} liveTemplates={templates.map((template) => template.id)} />
    </>
  )
}

// The grid, on /photos and under the viewer on /photos/[jobId] (a link to a work, a refresh).
// The Photos layout's viewer opens the work from the address.
export function PhotosScreen({ back, extra }: { back: string | Promise<string>; extra?: ReactNode }) {
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Photos back={back} />
      </Suspense>
      {extra}
    </AppPage>
  )
}
