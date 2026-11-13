'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { trackCatalogueSeeAll } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { BatchDialogSlot } from '../matrix/batch-dialog-slot'
import { CreateDialog, type CreateContext } from '../workspace/create-dialog'
import { filterCatalogue, openableTemplates } from './catalogue-filter'
import { catalogueSections, isTall, sectionsFor, type CatalogueSection } from './catalogue-sections'
import { CatalogueSections } from './catalogue-sections-view'
import { isMotion, isSlotTemplate } from './catalogue-template'
import { findSeries, type CatalogueView, type GridEntry } from './catalogue-view'
import { CategoryChips } from './category-chips'
import { SavedEmpty } from './saved-empty'
import { FeatureCard } from './feature-card'
import { SeriesCard } from './series-card'
import { TemplateCard } from './template-card'
import { useSeeAllLanding } from './use-see-all-landing'
import { useCatalogueQuery } from './use-catalogue-query'

// The series panel is only fetched once a series is opened (scripts/js-budget.json).
const SeriesCreateDialog = dynamic(() => import('../workspace/series-create-dialog').then((m) => m.SeriesCreateDialog), { ssr: false })

// `endCard`: the grid's last card, after every filter's cards (the Wishlist's "Not finding it?",
// passed in by the page while the wishlist is open).
type Props = { view: CatalogueView; create: CreateContext; endCard?: ReactNode }

// Create's catalogue (B comp create.html): the featured card, a sticky chip bar of up to three
// category levels (T102), the grid of side-by-side pair cards and series cards (one column on
// phones, two from md, three from lg; the Art Styles compare is the tall card), the series panel
// a series card opens (its members and the chosen one's form in one step, Owner 2026-11-12), and
// the creation dialog every template opens (DESIGN §6.9 item 2), and Batch create's dialog
// (?batch=1, opened by the card above the catalogue or a template's batch link). The
// chosen category and an open series live in the address (?category=, ?series=). With saved
// templates the bar leads with Saved (T83), read from the page's FavoritesProvider.
export function TemplateCatalogue({ view, create, endCard }: Props) {
  const t = useTranslations('app.create')
  const query = useCatalogueQuery(view.filters)
  const [openId, setOpenId] = useState<string | null>(null)
  const openable = useMemo(() => openableTemplates(view.entries), [view.entries])
  // Batch create takes every template that uses a photo, series members included.
  // Slot templates are single-run only (§5.1e): never in the batch dialog.
  const batchable = useMemo(() => openable.filter((template) => template.photoInput !== 'none' && !isSlotTemplate(template)), [openable])
  const featured = featuredOf(view.entries)
  const favoriteIds = useFavorites()?.ids
  const saved = useMemo(() => (favoriteIds ? savedIn(favoriteIds, openable) : []), [favoriteIds, openable])
  const { active, shown } = filterCatalogue(view.entries, saved, query.selection)
  const series = findSeries(view.entries, query.seriesKey)
  // Once loaded the panel stays mounted, so closing it can play its motion.
  const [sheetLoaded, setSheetLoaded] = useState(false)
  if (series && !sheetLoaded) setSheetLoaded(true)
  const { sentinel, stuck } = useStuck()
  const sections = useMemo(() => catalogueSections(view.filters, view.entries), [view.filters, view.entries])
  const bar = useRef<HTMLDivElement>(null)
  const landAfter = useSeeAllLanding(active.saved ? undefined : active.path[0], sentinel, bar)
  const seeAll = (section: CatalogueSection) => {
    trackCatalogueSeeAll(section.key)
    landAfter(section.slug)
    query.select({ saved: false, path: [section.slug] })
  }

  if (view.entries.length === 0) {
    // Batch create stays mounted even then: a batch already running keeps its dialog and results.
    return (
      <>
        <p className="px-(--gutter) pt-6 text-body text-muted-foreground">{t('empty')}</p>
        <BatchDialogSlot templates={batchable} create={create} />
      </>
    )
  }
  return (
    <>
      {featured ? (
        <Reveal className="px-(--gutter)">
          <FeatureCard template={featured} onOpen={setOpenId} />
        </Reveal>
      ) : null}
      <div ref={sentinel} aria-hidden="true" className="mt-4 h-px md:mt-6" />
      <div ref={bar} data-stuck={stuck || undefined} className="sticky top-0 z-40 py-2 data-[stuck]:nav-material data-[stuck]:pt-[calc(var(--sat)+8px)] md:top-14 md:data-[stuck]:pt-2">
        <CategoryChips filters={view.filters} saved={showSaved(saved.length, active.saved)} value={active} onChange={query.select} />
      </div>
      <h2 className="sr-only">{t('templates')}</h2>
      <CatalogueBody sections={sectionsFor(active, sections)} shown={shown} saved={active.saved} onBrowse={() => query.select({ saved: false, path: [] })} endCard={endCard} onOpen={setOpenId} onOpenSeries={query.openSeries} onSeeAll={seeAll} />
      <p className="px-(--gutter) pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">{t('illustrative')}</p>
      {sheetLoaded ? <SeriesCreateDialog series={series} onClose={query.closeSeries} {...create} /> : null}
      <CreateDialog template={openable.find((item) => item.id === openId) ?? null} onClose={() => setOpenId(null)} {...create} />
      <BatchDialogSlot templates={batchable} create={create} />
    </>
  )
}

type BodyProps = Omit<GridProps, 'entries' | 'className'> & {
  sections: CatalogueSection[] | null
  shown: readonly GridEntry[]
  // Saved is chosen: when it holds nothing, its empty state with the way back to All.
  saved: boolean
  onBrowse(): void
  onSeeAll(section: CatalogueSection): void
}

// The Saved chip shows while something is saved, and stays while Saved is chosen (我的收藏).
const showSaved = (count: number, chosen: boolean) => count > 0 || chosen

function CatalogueBody({ sections, shown, saved, onBrowse, endCard, onOpen, onOpenSeries, onSeeAll }: BodyProps) {
  if (saved && shown.length === 0) return <SavedEmpty onBrowse={onBrowse} />
  if (!sections) return <CatalogueGrid entries={shown} endCard={endCard} className="mt-2 md:mt-3" onOpen={onOpen} onOpenSeries={onOpenSeries} />
  return (
    <>
      <CatalogueSections sections={sections} onOpen={onOpen} onOpenSeries={onOpenSeries} onSeeAll={onSeeAll} />
      {endCard ? <CatalogueGrid entries={[]} endCard={endCard} className="mt-8 md:mt-10" onOpen={onOpen} onOpenSeries={onOpenSeries} /> : null}
    </>
  )
}

type GridProps = { entries: readonly GridEntry[]; endCard?: ReactNode; className: string; onOpen(id: string): void; onOpenSeries(slug: string): void }

// The flat grid: a chosen category, Saved, or All with a single category.
function CatalogueGrid({ entries, endCard, className, onOpen, onOpenSeries }: GridProps) {
  return (
    <ul className={cn('grid grid-flow-row-dense grid-cols-1 gap-x-3 gap-y-6 px-(--gutter) md:grid-cols-2 md:gap-x-4 lg:grid-cols-3', className)}>
      {entries.map((entry, index) => (
        <Reveal as="li" key={entryKey(entry)} className={cn(isTall(entry) && 'md:row-span-2')}>
          {entry.type === 'series' ? (
            <SeriesCard series={entry.series} onOpen={() => onOpenSeries(entry.series.slug)} eager={index < 3} />
          ) : (
            <TemplateCard template={entry.template} onOpen={onOpen} eager={index < 3} />
          )}
        </Reveal>
      ))}
      {endCard ? <Reveal as="li">{endCard}</Reveal> : null}
    </ul>
  )
}

// The featured card: the first single video template in the catalogue's order.
function featuredOf(entries: readonly GridEntry[]) {
  for (const entry of entries) if (entry.type === 'template' && isMotion(entry.template) && entry.template.cover.type === 'video') return entry.template
  return null
}

const entryKey = (entry: GridEntry) => (entry.type === 'series' ? `series-${entry.series.id}` : entry.template.id)

// True once the chip bar has stuck to the top: only then does it pad for the top safe area and
// take its bar material, so at rest there is no band over the ground (or the living background,
// T54) and a notched phone shows no empty strip above the chips.
function useStuck() {
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => setStuck(entry ? !entry.isIntersecting && entry.boundingClientRect.top < 0 : false))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { sentinel, stuck }
}
