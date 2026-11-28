import { Reveal } from '@/core/ui/reveal-item'
import { Layers } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ZipButtonLazy as ZipButton } from '../batch/zip-button-lazy'
import { cellPlaces, dayKeyIn, groupByBatch, groupByDay, type DaySection, type DoneEntry } from './batch-groups'
import { ColleagueCard, type DeleteCompanyWork } from './company/colleague-card'
import { DoneCard, EAGER_TILES, tileLoading } from './done-card'
import { DAY_BAR, DAY_LABEL, GRID } from './grid'
import { LoadMore } from './load-more'
import { PhotosEmpty } from './photos-empty'
import { tileUrlFor } from '@/core/jobs/job-view'
import { ThumbImg } from '@/core/ui/thumb-img'
import { doneWhen, tileMeta, type PhotoItem } from './photo-item'
import { RunningList } from './running-list'
import { WorksIndex } from './viewer/works-index'
import { ShareSelectProvider } from '../work-share/select-context'
import { ShareBar } from '../work-share/share-bar'
import { ShareToggle } from '../work-share/share-toggle'
import type { BulkDeleteAction, BulkSavedAction, CreateShareAction } from '../work-share/share-types'

// "Done", newest first: finished photos as a dense grid of pictures (2026-11-28; three columns
// on a phone, four from sm, six from lg), cut under a heading per day in the viewer's time zone.
// Each tile opens the viewer over the grid (2026-11-12). Empty state per DESIGN §4.6. Every tile
// shows the work's small copy, never the full file (ARCHITECTURE §8.3「作品小图」). share: with it,
// a Select button next to "Done" turns on picking works: one share link (§6.2「作品集分享」),
// download, or with bulk.remove delete (作品页改版 PR④). bulk.saved notes the downloads of works
// shown in the album view (work-share/album-save.ts). One prop for both: this file rides in
// Photos' first load, and the bar's body, which uses them, does not.
// more: the next page's address while older works remain (LoadMore); total: every finished work.
// rail: the filter under the heading and what an empty filter says: the personal page's
// categories, or on the company view (§6.5「作品页就是企业作品」) whose works, with the org owner's
// delete for colleagues' works (remove; null for staff and on the personal page).
export type GridRail = { filter: ReactNode; emptyNote: string; remove?: DeleteCompanyWork | null }
// running: the photos still developing (the server's, the tab adds its own) and the covers that
// stand in for them; they are the first tiles of Today. null: none are shown at all, this tab's
// own included (the company view under a filter that leaves the reader out).
export type Running = { server: PhotoItem[]; covers: Record<string, string | null> }
type Props = { items: PhotoItem[]; now: Date; timeZone: string; running: Running | null; liveTemplates: string[]; share?: CreateShareAction; bulk?: { remove?: BulkDeleteAction; saved?: BulkSavedAction }; more?: string | null; total?: number; rail?: GridRail }

export function DoneGrid({ items, now, timeZone, running, liveTemplates, share, bulk, more = null, total = items.length, rail }: Props) {
  const t = useTranslations('app')
  const format = useFormatter()
  const today = t('photos.today')
  if (items.length === 0) return <Nothing rail={rail} running={running} today={today} />
  const entries = groupByBatch(items)
  // Display order: what the viewer steps through.
  const ordered = entries.flatMap((entry) => (entry.kind === 'photo' ? [entry.item] : entry.items))
  // The first pictures to load are the first visible cells: a closed batch is one cell (its
  // stack), and its photos, not on screen until it is opened, stay lazy.
  const place = cellPlaces(entries)
  const at = (item: PhotoItem) => place.get(item.id) ?? EAGER_TILES
  const when = (iso: string) =>
    doneWhen(iso, now, timeZone, t, (date, sameYear) => format.dateTime(date, { year: sameYear ? undefined : 'numeric', month: 'long', day: 'numeric', timeZone }))
  // A colleague's work is not the reader's: its own tile and viewer, and never the reader's viewer.
  const card = (item: PhotoItem) =>
    item.maker ? (
      <ColleagueCard item={item} place={at(item)} remove={rail?.remove ?? null} />
    ) : (
      <DoneCard item={item} meta={tileMeta(item, t)} live={liveTemplates.includes(item.templateId)} place={at(item)} />
    )
  const grid = (
    <section aria-labelledby="done-h">
      <WorksIndex items={ordered.filter((item) => !item.maker)} />
      <div className="mx-(--gutter) mt-6 flex items-center justify-between gap-3 md:mt-8">
        <h2 id="done-h" className="text-headline leading-[1.2] font-semibold tracking-[-0.01em]">{t('photos.done')}</h2>
        {share ? <ShareToggle /> : null}
      </div>
      {rail?.filter}
      <Days entries={entries} zone={{ now, timeZone }} running={running} today={today} whole={more === null} draw={{ card, when, slot: (id) => place.get(id) ?? EAGER_TILES }} />
      {more ? <LoadMore href={more} shown={items.length} total={total} /> : null}
      <p className="mx-(--gutter) mt-6 max-w-[72ch] text-caption leading-[1.4] text-muted-foreground">{t('photos.footnote')}</p>
      {share ? <ShareBar create={share} {...bulk} /> : null}
    </section>
  )
  return share ? <ShareSelectProvider>{grid}</ShareSelectProvider> : grid
}

// How the grid draws: a photo's tile, a day or batch's date, and the cell a photo or a stack takes.
type Draw = { card(item: PhotoItem): ReactNode; when(iso: string): string; slot(id: string): number }
type DaysProps = { entries: DoneEntry[]; zone: { now: Date; timeZone: string }; running: Running | null; today: string; whole: boolean; draw: Draw }

// The list cut into days. Developing photos lead Today's grid; with no finished work today they
// bring their own Today section. whole: no older page remains, so the last day's count is right
// (otherwise that day may go on into the next page and its count would be short).
function Days({ entries, zone, running, today, whole, draw }: DaysProps) {
  const days = groupByDay(entries, zone.timeZone)
  const todayListed = days[0]?.key === dayKeyIn(zone.timeZone)(zone.now)
  const developing = running ? <RunningList server={running.server} covers={running.covers} today={todayListed ? undefined : today} /> : null
  return (
    <>
      {todayListed ? null : developing}
      {days.map((day, index) => (
        <Day key={day.key} day={day} title={draw.when(day.first)} counted={whole || index < days.length - 1} draw={draw} lead={todayListed && index === 0 ? developing : null} />
      ))}
    </>
  )
}

// No finished work: the developing ones alone under Today, or the empty state (which hides itself
// while this tab has a photo developing the server did not list).
function Nothing({ rail, running, today }: { rail?: GridRail; running: Running | null; today: string }) {
  const developing = running ? <RunningList server={running.server} covers={running.covers} today={today} /> : null
  if (rail) return <>{developing}<FilteredEmpty rail={rail} /></>
  return <>{developing}{running && running.server.length > 0 ? null : <PhotosEmpty />}</>
}

// Nothing under the chosen filter: the rail stays, so the way back is there.
function FilteredEmpty({ rail }: { rail: GridRail }) {
  const t = useTranslations('app.photos')
  return (
    <section aria-labelledby="done-h">
      <h2 id="done-h" className="mx-(--gutter) mt-6 text-headline leading-[1.2] font-semibold tracking-[-0.01em] md:mt-8">{t('done')}</h2>
      {rail.filter}
      <p className="hairline-lit mx-(--gutter) mt-4 rounded-panel bg-card p-4 text-label text-muted-foreground">{rail.emptyNote}</p>
    </section>
  )
}


type DayProps = { day: DaySection; title: string; counted: boolean; draw: Draw; lead?: ReactNode }

// One day: its heading is a frosted label that stays under the top of the screen while the day
// scrolls by (below the desktop tab bar), so a long day never loses its date. A label, not a
// band: the page's ground is not flat, and a band would show its edges at rest.
function Day({ day, title, counted, draw, lead }: DayProps) {
  const t = useTranslations('app.photos')
  const id = `day-${day.key}`
  return (
    <section aria-labelledby={id}>
      <div className={DAY_BAR}>
        <div className={DAY_LABEL}>
          <h3 id={id} className="text-body leading-[1.25] font-semibold">{title}</h3>
          {counted ? <span className="text-caption text-bone-dim tabular-nums">{t('dayCount', { count: day.count })}</span> : null}
        </div>
      </div>
      <ul className={GRID}>
        {lead}
        {day.entries.map((entry) =>
          entry.kind === 'photo' ? (
            <Reveal as="li" key={entry.item.id}>
              {draw.card(entry.item)}
            </Reveal>
          ) : (
            <li key={entry.batchId} className="group/batch contents">
              <BatchStack entry={entry} draw={draw} />
            </li>
          ),
        )}
      </ul>
    </section>
  )
}

// One batch (T107), as a stack (2026-11-28; it was a ruled band across the grid, which cut the
// page into strips): one cell, its first photo under the batch's count. Opening it puts a line
// across the grid with what it was, its ZIP and "Collapse", then its photos in batch order, each
// an ordinary tile. No script: one checkbox is the control, and CSS shows the stack or the batch.
// The <li> is display: contents, so the head cell and the photos are all cells of the grid.
// The checkbox stays in the head cell whether the batch is open or not, so the keyboard keeps its
// place and a screen reader hears the state; the stack (closed) and "Collapse" (open) are its two
// labels, and whichever is showing wears the focus ring.
function BatchStack({ entry, draw }: { entry: Extract<DoneEntry, { kind: 'batch' }>; draw: Draw }) {
  const t = useTranslations('app.photos')
  const toggle = `batch-${entry.batchId}`
  const first = entry.items[0]!
  const title = t('batch.title', { count: entry.items.length, templates: entry.templates })
  return (
    <>
      <div className="relative group-has-[:checked]/batch:col-span-full">
        <input id={toggle} type="checkbox" aria-label={t('batch.open', { title })} className="peer sr-only" />
        <label htmlFor={toggle} className="press relative block cursor-pointer rounded-inner peer-checked:hidden peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
          <span aria-hidden="true" className="absolute inset-x-2 -top-[3px] h-2 rounded-t-[8px] bg-accent" />
          <span className="relative block aspect-[4/5] overflow-hidden rounded-inner bg-muted">
            {/* The first photo's tile copy, fetched as this cell's place on the screen says. */}
            {first.thumbUrl ? <ThumbImg src={first.thumbUrl} fallback={tileUrlFor(first.id)} alt="" width={320} height={400} {...tileLoading(draw.slot(entry.batchId))} decoding="async" className="absolute inset-0 size-full object-cover" /> : null}
            <span className="frost absolute top-1.5 right-1.5 inline-flex min-h-6 items-center gap-1 rounded-full px-2 text-caption leading-none font-semibold text-photo-ink tabular-nums">
              <Layers aria-hidden strokeWidth={2} className="size-3.5" />
              {entry.items.length}
            </span>
          </span>
        </label>
        <div className="hidden flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-2 pb-1 peer-checked:flex">
          <div className="min-w-0">
            <p className="text-body leading-[1.25] font-semibold">{title}</p>
            <p className="text-caption text-muted-foreground">{draw.when(first.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            {entry.paid > 0 ? <ZipButton batchId={entry.batchId} count={entry.paid} className="max-w-full" /> : null}
            <label htmlFor={toggle} className="press hairline inline-flex min-h-9 cursor-pointer items-center rounded-full bg-wash px-4 text-caption font-medium [.peer:focus-visible~div_&]:ring-2 [.peer:focus-visible~div_&]:ring-ring">
              {t('batch.close')}
            </label>
          </div>
        </div>
      </div>
      {entry.items.map((item) => (
        <div key={item.id} className="hidden group-has-[:checked]/batch:block">
          {draw.card(item)}
        </div>
      ))}
    </>
  )
}
