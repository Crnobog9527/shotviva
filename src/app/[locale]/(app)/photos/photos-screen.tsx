import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { preconnect } from 'react-dom'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { decodeOwnJobsCursor, encodeOwnJobsCursor, fileUrlFor, firstThumbUrls, listOwnJobs } from '@/core/jobs'
import { currentLocale } from '@/core/i18n/server'
import { r2Origin, r2Store } from '@/core/storage'
import { cachedPosterTemplates, cachedWebTemplates, EDIT_TEMPLATE_ID } from '@/core/templates'
import { DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

import { createWorkShareAction } from './share-actions'

// Photos counts days where its readers are: the server cannot know the browser's zone, so the
// Chinese site reads Beijing time and the English one UTC, as before.
const PHOTOS_ZONE: Record<string, string> = { zh: 'Asia/Shanghai' }

function Header({ aside }: { aside?: ReactNode }) {
  return <TabRootHeader title={useTranslations('app.photos')('title')} aside={aside} />
}

// Photos tab (B comp photos.html): photos still developing, then finished ones. back: where
// sign-in returns to (a work's own address on /photos/[jobId]). until: ?until= from Load more,
// the last work already shown (own-jobs.ts); the page then lists down to it and one page more.
async function Photos({ back, until }: { back: string | Promise<string>; until?: Promise<string | undefined> }) {
  const user = await requireUser(await back)
  const now = new Date()
  const cursor = decodeOwnJobsCursor(await until)
  // The first screen's small copies are signed while the templates are still being read.
  const works = listOwnJobs(createAdminSupabase(), user.id, now, cursor).then(async (own) => ({ own, signed: await firstThumbUrls(r2Store, own.done) }))
  const locale = await currentLocale()
  const [{ own, signed }, templates, posters] = await Promise.all([works, cachedWebTemplates(locale, true), cachedPosterTemplates(locale)])
  const tp = await getTranslations('app.photos')
  const fallback = tp('fallbackName')
  // Poster templates are outside the catalogue (ARCHITECTURE §5.3) but name their works too.
  const lookup: TemplateLookup = new Map([...templates, ...posters].map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  // Edits run on the built-in `edit` template, which is in no catalogue (ARCHITECTURE §5.2).
  lookup.set(EDIT_TEMPLATE_ID, { name: tp('editedName'), cover: null })
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback, signed.get(job.id)))
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={own.total} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid
        items={done}
        now={now}
        timeZone={PHOTOS_ZONE[locale] ?? 'UTC'}
        anyRunning={running.length > 0}
        liveTemplates={templates.map((template) => template.id)}
        share={createWorkShareAction}
        total={own.total}
        more={own.next ? `/photos?until=${encodeOwnJobsCursor(own.next)}` : null}
      />
    </>
  )
}

// The grid, on /photos and under the viewer on /photos/[jobId] (a link to a work, a refresh).
// The Photos layout's viewer opens the work from the address.
export function PhotosScreen({ back, until, extra }: { back: string | Promise<string>; until?: Promise<string | undefined>; extra?: ReactNode }) {
  // The first screen's pictures come straight from R2: the connection opens with the page's shell,
  // while the list is still being read, instead of when the first <img> arrives.
  const origin = r2Origin()
  if (origin) preconnect(origin)
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Photos back={back} until={until} />
      </Suspense>
      {extra}
    </AppPage>
  )
}
