import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Suspense, type ReactNode } from 'react'
import { preconnect } from 'react-dom'

import { AppPage, TabRootHeader } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { decodeOwnJobsCursor, encodeOwnJobsCursor, fileUrlFor, FIRST_SCREEN_THUMBS, firstThumbUrls, listOwnJobs, listOwnPhotoCategories, ownJobsFilterFrom, type OwnJobsFilter, type OwnPhotoCategory } from '@/core/jobs'
import { currentLocale } from '@/core/i18n/server'
import { logger } from '@/core/logger'
import { r2Origin, r2Store } from '@/core/storage'
import { cachedPosterTemplates, cachedWebTemplates, EDIT_TEMPLATE_ID } from '@/core/templates'
import { readCompanySeat } from '@/core/org/works'
import { DoneGrid, heldBy, offersFilter, PhotoFilterRail, PhotosCount, photosHref, toPhotoItem, type TemplateLookup } from '@/modules/image'

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
// category, mark: the personal page's filter (?category=<root category>, ?mark=watermark), one at
// a time; the company view has its own rail and ignores them.
type Query = Promise<string | undefined>
type Asked = { back: string | Promise<string>; until?: Query; member?: Query; category?: Query; mark?: Query }

// The company view takes the category alone (it has no watermark filter).
const categoryOf = (filter: OwnJobsFilter | null) => (filter && 'category' in filter ? filter.category : null)

async function Photos({ back, until, member, category, mark }: Asked) {
  const user = await requireUser(await back)
  const now = new Date()
  const cursor = decodeOwnJobsCursor(await until)
  const filter = ownJobsFilterFrom(await category, await mark)
  const db = createAdminSupabase()
  // An active member of an org whose workspace is on sees the company's works here instead. The
  // personal list is read alongside, not after, so nobody else waits for the seat check; a
  // company member's copy of it is dropped. Under a filter the list and what the filter offers
  // wait for the seat check instead: a company member's page (its own rail, no categories) never
  // calls the filter's functions (migration 2039).
  // The first screen's small copies are signed while the templates are still being read.
  const seated = readCompanySeat(db, user.id)
  seated.catch(() => undefined)
  const list = () => listOwnJobs(db, user.id, now, cursor, undefined, filter).then(async (own) => ({ own, signed: await firstThumbUrls(r2Store, own.done, FIRST_SCREEN_THUMBS, 'tile') }))
  const works = filter ? seated.then((seat) => (seat ? null : list())) : list()
  works.catch(() => undefined)
  // Without the chips the page still lists, with no rail.
  const offered = seated.then((seat) => (seat ? [] : listOwnPhotoCategories(db, user.id))).catch((error: unknown) => {
    logger.error('photos.categories_failed', { error })
    return [] as OwnPhotoCategory[]
  })
  const locale = await currentLocale()
  const [seat, templates, posters] = await Promise.all([seated, cachedWebTemplates(locale, true), cachedPosterTemplates(locale)])
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
    return <CompanyPhotos db={db} userId={user.id} seat={seat} now={now} timeZone={timeZone} filter={(await member) ?? null} category={categoryOf(filter)} until={cursor} lookup={lookup} liveTemplates={liveTemplates} covers={covers} />
  }
  const [personal, categories] = await Promise.all([works, offered])
  // Not a company member here, so the list was read.
  const { own, signed } = personal!
  const running = own.running.map((job) => toPhotoItem(job, lookup, null, fallback))
  const done = own.done.map((job) => toPhotoItem(job, lookup, fileUrlFor(job.id), fallback, signed.get(job.id)))
  // How many works the filter holds: the chip's own count (what is listed, if the chips failed).
  const held = filter ? (heldBy(categories, filter) ?? done.length) : own.total
  return (
    <>
      <Header aside={<PhotosCount runningIds={running.map((item) => item.id)} done={own.total} />} />
      <DoneGrid
        items={done}
        now={now}
        timeZone={timeZone}
        // Under a filter the grid is finished works only: none developing, this tab's included.
        running={filter ? null : { server: running, covers }}
        liveTemplates={liveTemplates}
        share={createWorkShareAction}
        total={held}
        more={own.next ? photosHref(filter, encodeOwnJobsCursor(own.next)) : null}
        rail={offersFilter(categories, filter) ? { filter: <PhotoFilterRail categories={categories} current={filter} />, emptyNote: tp('filter.empty') } : undefined}
      />
    </>
  )
}

// The grid, on /photos and under the viewer on /photos/[jobId] (a link to a work, a refresh).
// The Photos layout's viewer opens the work from the address.
export function PhotosScreen({ extra, ...asked }: Asked & { extra?: ReactNode }) {
  // The first screen's pictures come straight from R2: the connection opens with the page's shell,
  // while the list is still being read, instead of when the first <img> arrives.
  const origin = r2Origin()
  if (origin) preconnect(origin)
  return (
    <AppPage wide>
      <Suspense fallback={<Header />}>
        <Photos {...asked} />
      </Suspense>
      {extra}
    </AppPage>
  )
}
