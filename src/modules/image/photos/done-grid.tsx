import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { Link } from '@/core/i18n/ui'
import { thumbUrlFor } from '@/core/jobs/job-view'
import { Reveal } from '@/core/ui/reveal-item'
import { ThumbImg } from '@/core/ui/thumb-img'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { makeAgainHref } from '../again/again-start'
import { WorkTag } from '../result/work-tag'
import { ZipButtonLazy as ZipButton } from '../batch/zip-button-lazy'
import { groupByBatch, type DoneEntry } from './batch-groups'
import { PhotosEmpty } from './photos-empty'
import { doneMeta, doneWhen, type PhotoItem } from './photo-item'

// "Done", newest first (B comp photos.html): finished photos with their pool's tag, two columns
// on phones, three from md, four from lg. Each opens its result page; below it a quiet
// "Make again" goes to the template's workspace when the template is still in the catalogue
// (an edit or a retired template has none). Empty state per DESIGN §4.6. Every tile shows the
// work's small copy, never the full file (ARCHITECTURE §8.3「作品小图」).
export function DoneGrid({ items, now, anyRunning, liveTemplates }: { items: PhotoItem[]; now: Date; anyRunning: boolean; liveTemplates: string[] }) {
  const t = useTranslations('app')
  const format = useFormatter()
  const day = (date: Date) => format.dateTime(date, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  if (items.length === 0) return anyRunning ? null : <PhotosEmpty />
  const entries = groupByBatch(items)
  const place = new Map(entries.flatMap((entry) => (entry.kind === 'photo' ? [entry.item] : entry.items)).map((item, index) => [item.id, index]))
  const card = (item: PhotoItem) => <DoneCard item={item} meta={doneMeta(item, now, t, day)} live={liveTemplates.includes(item.templateId)} place={place.get(item.id) ?? EAGER_TILES} />
  return (
    <section aria-labelledby="done-h">
      <div className="mx-(--gutter) mt-6 mb-3 flex items-baseline justify-between gap-3 md:mt-8">
        <h2 id="done-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('photos.done')}</h2>
        <span className="text-caption text-muted-foreground">{t('photos.newest')}</span>
      </div>
      <ul className={GRID}>
        {entries.map((entry) =>
          entry.kind === 'photo' ? (
            <Reveal as="li" key={entry.item.id}>
              {card(entry.item)}
            </Reveal>
          ) : (
            <li key={entry.batchId} className="col-span-full">
              <BatchGroup entry={entry} when={doneWhen(entry.items[0]!, now, t, day)} card={card} />
            </li>
          ),
        )}
      </ul>
      <p className="mx-(--gutter) mt-4 max-w-[72ch] text-caption leading-[1.4] text-muted-foreground">{t('photos.footnote')}</p>
    </section>
  )
}

const GRID = 'grid grid-cols-2 gap-x-2 gap-y-4 px-(--gutter) md:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4'

// The first screen is fetched at once (two rows of four on a desktop, three of two on a phone)
// and its first row ahead of everything else, because one of those tiles is the page's largest
// paint; the rest wait until they are scrolled near.
const EAGER_TILES = 8
const FIRST_ROW = 4

// place: where the tile comes in the grid, 0 first.
function DoneCard({ item, meta, live, place }: { item: PhotoItem; meta: string; live: boolean; place: number }) {
  const t = useTranslations('app')
  return (
    <div className="flex h-full flex-col transition-transform duration-250 ease-house hover:-translate-y-0.5">
      <Link href={`/photos/${item.id}`} className="group press block rounded-control">
        <span className="hairline relative block aspect-[4/5] overflow-hidden rounded-control bg-muted transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--input)]">
          {item.thumbUrl ? (
            <ThumbImg
              src={item.thumbUrl}
              fallback={thumbUrlFor(item.id)}
              alt={t('photos.photoAlt', { name: item.templateName })}
              width={480}
              height={600}
              loading={place < EAGER_TILES ? 'eager' : 'lazy'}
              fetchPriority={place < FIRST_ROW ? 'high' : 'auto'}
              decoding="async"
              className={`${REPLAY_BLOCK_CLASS} absolute inset-0 size-full object-cover transition-transform duration-600 ease-house group-hover:scale-[1.02]`}
            />
          ) : null}
          <WorkTag pool={item.creditPool} visibility={item.visibility} className="absolute bottom-2 left-2" />
        </span>
        <b className="mt-2 block text-body font-semibold">{item.templateName}</b>
        <small className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{meta}</small>
      </Link>
      {live ? <MakeAgain templateId={item.templateId} jobId={item.id} /> : null}
    </div>
  )
}

// One batch (T107): a ruled band across the grid with what it was and its ZIP, then its photos
// in batch order on the same grid. The grid's own gutter is undone so the inner one lines up.
function BatchGroup({ entry, when, card }: { entry: Extract<DoneEntry, { kind: 'batch' }>; when: string; card(item: PhotoItem): ReactNode }) {
  const t = useTranslations('app.photos.batch')
  const id = `batch-${entry.batchId}`
  return (
    <section aria-labelledby={id} className="-mx-(--gutter) border-y border-hairline py-4">
      <div className="mx-(--gutter) mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={id} className="text-body leading-[1.25] font-semibold">{t('title', { count: entry.items.length, templates: entry.templates })}</h3>
          <p className="mt-1 text-caption text-muted-foreground">{when}</p>
        </div>
        {entry.paid > 0 ? <ZipButton batchId={entry.batchId} count={entry.paid} className="max-w-full" /> : null}
      </div>
      <ul className={GRID}>
        {entry.items.map((item) => (
          <li key={item.id}>{card(item)}</li>
        ))}
      </ul>
    </section>
  )
}

// "Make again ›": the template's workspace page, the full-page form (DESIGN §6.9 item 2), opened
// from this work like the photo page's Make again: its settings and its kept photo (T40). No
// prefetch: opening it copies the kept photo back to a fresh upload.
function MakeAgain({ templateId, jobId }: { templateId: string; jobId: string }) {
  const t = useTranslations('app.photos')
  return (
    <Link href={makeAgainHref(templateId, jobId)} prefetch={false} className="mt-1 inline-flex min-h-9 items-center gap-0.5 self-start text-caption font-medium text-foreground hover:underline hover:underline-offset-3">
      {t('makeAgain')}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
