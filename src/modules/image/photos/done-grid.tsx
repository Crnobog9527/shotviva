import { Reveal } from '@/core/ui/reveal-item'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ZipButtonLazy as ZipButton } from '../batch/zip-button-lazy'
import { groupByBatch, groupByDay, type DaySection, type DoneEntry } from './batch-groups'
import { ColleagueCard, type DeleteCompanyWork } from './company/colleague-card'
import { DoneCard, EAGER_TILES } from './done-card'
import { LoadMore } from './load-more'
import { PhotosEmpty } from './photos-empty'
import { doneWhen, tileMeta, type PhotoItem } from './photo-item'
import { WorksIndex } from './viewer/works-index'
import { ShareSelectProvider } from '../work-share/select-context'
import { ShareBar } from '../work-share/share-bar'
import { ShareToggle } from '../work-share/share-toggle'
import type { CreateShareAction } from '../work-share/share-types'

// "Done", newest first: finished photos as a dense grid of pictures (2026-11-28; three columns
// on a phone, four from sm, six from lg), cut under a heading per day in the viewer's time zone.
// Each tile opens the viewer over the grid (2026-11-12). Empty state per DESIGN §4.6. Every tile
// shows the work's small copy, never the full file (ARCHITECTURE §8.3「作品小图」). share: with it,
// a Share button next to "Done" turns on picking works for one share link (§6.2「作品集分享」).
// more: the next page's address while older works remain (LoadMore); total: every finished work.
// company: Photos' company view (§6.5「作品页就是企业作品」): the filter rail under the heading, what
// an empty filter says, and the org owner's delete for colleagues' works (null for staff).
export type CompanyGrid = { filter: ReactNode; emptyNote: string; remove: DeleteCompanyWork | null }
type Props = { items: PhotoItem[]; now: Date; timeZone: string; anyRunning: boolean; liveTemplates: string[]; share?: CreateShareAction; more?: string | null; total?: number; company?: CompanyGrid }

export function DoneGrid({ items, now, timeZone, anyRunning, liveTemplates, share, more = null, total = items.length, company }: Props) {
  const t = useTranslations('app')
  const format = useFormatter()
  if (items.length === 0) return <Nothing company={company} anyRunning={anyRunning} />
  const entries = groupByBatch(items)
  // Display order: the viewer steps through it, and the first tiles load first.
  const ordered = entries.flatMap((entry) => (entry.kind === 'photo' ? [entry.item] : entry.items))
  const place = new Map(ordered.map((item, index) => [item.id, index]))
  const at = (item: PhotoItem) => place.get(item.id) ?? EAGER_TILES
  const when = (iso: string) =>
    doneWhen(iso, now, timeZone, t, (date, sameYear) => format.dateTime(date, { year: sameYear ? undefined : 'numeric', month: 'long', day: 'numeric', timeZone }))
  // A colleague's work is not the reader's: its own tile and viewer, and never the reader's viewer.
  const card = (item: PhotoItem) =>
    item.maker ? (
      <ColleagueCard item={item} eager={at(item) < EAGER_TILES} remove={company?.remove ?? null} />
    ) : (
      <DoneCard item={item} meta={tileMeta(item, t)} live={liveTemplates.includes(item.templateId)} place={at(item)} />
    )
  const days = groupByDay(entries, timeZone)
  const grid = (
    <section aria-labelledby="done-h">
      <WorksIndex items={ordered.filter((item) => !item.maker)} />
      <div className="mx-(--gutter) mt-6 flex items-center justify-between gap-3 md:mt-8">
        <h2 id="done-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('photos.done')}</h2>
        {share ? <ShareToggle /> : null}
      </div>
      {company?.filter}
      {days.map((day, index) => (
        // The oldest day shown may go on into the next page: its count would be short.
        <Day key={day.key} day={day} title={when(day.first)} counted={more === null || index < days.length - 1} card={card} when={when} />
      ))}
      {more ? <LoadMore href={more} shown={items.length} total={total} /> : null}
      <p className="mx-(--gutter) mt-6 max-w-[72ch] text-caption leading-[1.4] text-muted-foreground">{t('photos.footnote')}</p>
      {share ? <ShareBar create={share} /> : null}
    </section>
  )
  return share ? <ShareSelectProvider>{grid}</ShareSelectProvider> : grid
}

function Nothing({ company, anyRunning }: { company?: CompanyGrid; anyRunning: boolean }) {
  if (company) return <CompanyEmpty company={company} />
  return anyRunning ? null : <PhotosEmpty />
}

// The company view with nothing under the chosen filter: the rail stays, so the way back is there.
function CompanyEmpty({ company }: { company: CompanyGrid }) {
  const t = useTranslations('app.photos')
  return (
    <section aria-labelledby="done-h">
      <h2 id="done-h" className="mx-(--gutter) mt-6 text-headline leading-[1.2] font-semibold tracking-[-0.01em] md:mt-8">{t('done')}</h2>
      {company.filter}
      <p className="hairline-lit mx-(--gutter) mt-4 rounded-panel bg-card p-4 text-label text-muted-foreground">{company.emptyNote}</p>
    </section>
  )
}

const GRID = 'grid grid-cols-3 gap-1 px-(--gutter) sm:grid-cols-4 md:gap-2 lg:grid-cols-6'

type DayProps = { day: DaySection; title: string; counted: boolean; card(item: PhotoItem): ReactNode; when(iso: string): string }

// One day: its heading is a frosted label that stays under the top of the screen while the day
// scrolls by (below the desktop tab bar), so a long day never loses its date. A label, not a
// band: the page's ground is not flat, and a band would show its edges at rest.
function Day({ day, title, counted, card, when }: DayProps) {
  const t = useTranslations('app.photos')
  const id = `day-${day.key}`
  return (
    <section aria-labelledby={id}>
      <div className="pointer-events-none sticky top-[calc(var(--sat)+8px)] z-10 px-(--gutter) pt-5 pb-2 md:top-16">
        <div className="frost hairline inline-flex min-h-8 items-baseline gap-2 rounded-full px-3 py-1.5">
          <h3 id={id} className="text-body leading-[1.25] font-semibold">{title}</h3>
          {counted ? <span className="text-caption text-bone-dim tabular-nums">{t('dayCount', { count: day.count })}</span> : null}
        </div>
      </div>
      <ul className={GRID}>
        {day.entries.map((entry) =>
          entry.kind === 'photo' ? (
            <Reveal as="li" key={entry.item.id}>
              {card(entry.item)}
            </Reveal>
          ) : (
            <li key={entry.batchId} className="col-span-full">
              <BatchGroup entry={entry} when={when(entry.items[0]!.createdAt)} card={card} />
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

// One batch (T107): a ruled band across the grid with what it was and its ZIP, then its photos
// in batch order on the same grid. The grid's own gutter is undone so the inner one lines up.
function BatchGroup({ entry, when, card }: { entry: Extract<DoneEntry, { kind: 'batch' }>; when: string; card(item: PhotoItem): ReactNode }) {
  const t = useTranslations('app.photos.batch')
  const id = `batch-${entry.batchId}`
  return (
    <section aria-labelledby={id} className="-mx-(--gutter) my-2 border-y border-hairline py-4">
      <div className="mx-(--gutter) mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h4 id={id} className="text-body leading-[1.25] font-semibold">{t('title', { count: entry.items.length, templates: entry.templates })}</h4>
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
