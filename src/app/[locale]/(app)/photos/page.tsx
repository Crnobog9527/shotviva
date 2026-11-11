import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { preconnect } from 'react-dom'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { fileUrlFor, firstThumbUrls, listOwnJobs } from '@/core/jobs'
import { currentLocale } from '@/core/i18n/server'
import { r2Origin, r2Store } from '@/core/storage'
import { cachedWebTemplates, EDIT_TEMPLATE_ID } from '@/core/templates'
import { DeletedToast, DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.photos'))('metaTitle') }
}

function Header({ aside }: { aside?: ReactNode }) {
  return <TabRootHeader title={useTranslations('app.photos')('title')} aside={aside} />
}

// Photos tab (B comp photos.html): photos still developing, then finished ones.
async function Photos() {
  const user = await requireUser('/photos')
  const now = new Date()
  // The first screen's small copies are signed while the templates are still being read.
  const works = listOwnJobs(createAdminSupabase(), user.id, now).then(async (own) => ({ own, signed: await firstThumbUrls(r2Store, own.done) }))
  const [{ own, signed }, templates] = await Promise.all([works, cachedWebTemplates(await currentLocale(), true)])
  const tp = await getTranslations('app.photos')
  const fallback = tp('fallbackName')
  const lookup: TemplateLookup = new Map(templates.map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  // Edits run on the built-in `edit` template, which is in no catalogue (ARCHITECTURE §5.2).
  lookup.set(EDIT_TEMPLATE_ID, { name: tp('editedName'), cover: null })
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback, signed.get(job.id)))
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={done.length} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid items={done} now={now} anyRunning={running.length > 0} liveTemplates={templates.map((template) => template.id)} />
    </>
  )
}

// ?deleted=1: back from deleting a work (T41).
async function Deleted({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (await searchParams).deleted === '1' ? <DeletedToast /> : null
}

export default function PhotosPage({ searchParams }: PageProps<'/[locale]/photos'>) {
  // The first screen's pictures come straight from R2: the connection opens with the page's shell,
  // while the list is still being read, instead of when the first <img> arrives.
  const origin = r2Origin()
  if (origin) preconnect(origin)
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Photos />
      </Suspense>
      <Suspense>
        <Deleted searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
