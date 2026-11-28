import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { preconnect } from 'react-dom'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { decodeOwnJobsCursor, encodeOwnJobsCursor, fileUrlFor, FIRST_SCREEN_THUMBS, firstThumbUrls, listOwnJobs } from '@/core/jobs'
import { currentLocale } from '@/core/i18n/server'
import { r2Origin, r2Store } from '@/core/storage'
import { cachedPosterTemplates, cachedWebTemplates, EDIT_TEMPLATE_ID } from '@/core/templates'
import { readCompanySeat } from '@/core/org/works'
import { DoneGrid, PhotosCount, RunningList, toPhotoItem, type TemplateLookup } from '@/modules/image'

import { CompanyPhotos } from './company-screen'
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
// member: ?member= on the company view (whose works; §6.5「作品页就是企业作品」), ignored elsewhere.
type Asked = { back: string | Promise<string>; until?: Promise<string | undefined>; member?: Promise<string | undefined> }

async function Photos({ back, until, member }: Asked) {
  const user = await requireUser(await back)
  const now = new Date()
  const cursor = decodeOwnJobsCursor(await until)
  const db = createAdminSupabase()
  // An active member of an org whose workspace is on sees the company's works here instead. The
  // personal list is read alongside, not after, so nobody else waits for the seat check; a
  // company member's copy of it is dropped.
  // The first screen's small copies are signed while the templates are still being read.
<<<<<<< HEAD
  const works = listOwnJobs(db, user.id, now, cursor).then(async (own) => ({ own, signed: await firstThumbUrls(r2Store, own.done) }))
  works.catch(() => undefined)
=======
  const works = listOwnJobs(createAdminSupabase(), user.id, now, cursor).then(async (own) => ({ own, signed: await firstThumbUrls(r2Store, own.done, FIRST_SCREEN_THUMBS, 'tile') }))
>>>>>>> origin/main
  const locale = await currentLocale()
  const [seat, templates, posters] = await Promise.all([readCompanySeat(db, user.id), cachedWebTemplates(locale, true), cachedPosterTemplates(locale)])
  const tp = await getTranslations('app.photos')
  const fallback = tp('fallbackName')
  // Poster templates are outside the catalogue (ARCHITECTURE §5.3) but name their works too.
  const lookup: TemplateLookup = new Map([...templates, ...posters].map((t) => [t.id, { name: t.name, cover: t.coverAfterUrl ?? t.coverPosterUrl }]))
  // Edits run on the built-in `edit` template, which is in no catalogue (ARCHITECTURE §5.2).
  lookup.set(EDIT_TEMPLATE_ID, { name: tp('editedName'), cover: null })
  const covers = Object.fromEntries([...lookup].map(([id, t]) => [id, t.cover]))
  const timeZone = PHOTOS_ZONE[locale] ?? 'UTC'
  const liveTemplates = templates.map((template) => template.id)
  if (seat) {
    return <CompanyPhotos db={db} userId={user.id} seat={seat} now={now} timeZone={timeZone} filter={(await member) ?? null} until={cursor} lookup={lookup} liveTemplates={liveTemplates} covers={covers} />
  }
  const { own, signed } = await works
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback, signed.get(job.id)))
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={own.total} />} />
      <RunningList server={running} covers={covers} />
      <DoneGrid
        items={done}
        now={now}
        timeZone={timeZone}
        anyRunning={running.length > 0}
        liveTemplates={liveTemplates}
        share={createWorkShareAction}
        total={own.total}
        more={own.next ? `/photos?until=${encodeOwnJobsCursor(own.next)}` : null}
      />
    </>
  )
}

// The grid, on /photos and under the viewer on /photos/[jobId] (a link to a work, a refresh).
// The Photos layout's viewer opens the work from the address.
export function PhotosScreen({ back, until, member, extra }: Asked & { extra?: ReactNode }) {
  // The first screen's pictures come straight from R2: the connection opens with the page's shell,
  // while the list is still being read, instead of when the first <img> arrives.
  const origin = r2Origin()
  if (origin) preconnect(origin)
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Photos back={back} until={until} member={member} />
      </Suspense>
      {extra}
    </AppPage>
  )
}
