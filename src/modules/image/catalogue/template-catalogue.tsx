'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { trackCatalogueSeeAll } from '@/core/analytics/browser'
import { useRouter } from '@/core/i18n/navigation'
import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { BatchDialogSlot } from '../matrix/batch-dialog-slot'
import { CreateDialog, type CreateContext } from '../workspace/create-dialog'
import { filterCatalogue, openableTemplates } from './catalogue-filter'
import { buildSearchIndex, searchTemplates } from './catalogue-search'
import { catalogueSections, isTall, sectionsFor, type CatalogueSection } from './catalogue-sections'
import { CatalogueSections } from './catalogue-sections-view'
import { batchableTemplates, isMotion, posterHref, type CatalogueTemplate } from './catalogue-template'
import { findSeries, type CatalogueView, type GridEntry } from './catalogue-view'
import { CategoryChips } from './category-chips'
import { SearchBox } from './search-box'
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
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const openable = useMemo(() => openableTemplates(view.entries), [view.entries])
  const batchable = useMemo(() => batchableTemplates(openable), [openable])
  // A poster template's card goes to its editor (ARCHITECTURE §5.3); every other card opens the dialog.
  const open = (id: string) => {
    const found = openable.find((item) => item.id === id)
    const href = found ? posterHref(found) : null
    if (href) router.push(href)
    else setOpenId(id)
  }
  const featured = featuredOf(view.entries)
  const favoriteIds = useFavorites()?.ids
  const saved = useMemo(() => (favoriteIds ? savedIn(favoriteIds, openable) : []), [favoriteIds, openable])
  const { active, shown } = filterCatalogue(view.entries, saved, query.selection)
  const series = findSeries(view.entries, query.seriesKey)
  // Once loaded the panel stays mounted, so closing it can play its motion.
  const [sheetLoaded, setSheetLoaded] = useState(false)
  if (series && !sheetLoaded) setSheetLoaded(true)
  const search = useCatalogueSearch(view)
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
          <FeatureCard template={featured} onOpen={open} />
        </Reveal>
      ) : null}
      <div ref={sentinel} aria-hidden="true" className="mt-4 h-px md:mt-6" />
      <div ref={bar} data-stuck={stuck || undefined} className="sticky top-0 z-40 py-2 data-[stuck]:nav-material data-[stuck]:pt-[calc(var(--sat)+8px)] md:top-14 md:data-[stuck]:pt-2">
        <div className="mb-2 px-(--gutter)">
          <SearchBox value={search.query} onChange={search.setQuery} label={t('search')} clear={t('searchClear')} className="md:max-w-[420px]" />
        </div>
        <CategoryChips hidden={search.results !== null} filters={view.filters} saved={saved.length > 0} value={active} onChange={query.select} labels={chipLabels(t)} />
      </div>
      <h2 className="sr-only">{t('templates')}</h2>
      <CatalogueBody search={search} sections={sectionsFor(active, sections)} shown={shown} endCard={endCard} onOpen={open} onOpenSeries={query.openSeries} onSeeAll={seeAll} />
      <p className="px-(--gutter) pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">{t('illustrative')}</p>
      {sheetLoaded ? <SeriesCreateDialog series={series} onClose={query.closeSeries} {...create} /> : null}
      <CreateDialog template={openable.find((item) => item.id === openId) ?? null} onClose={() => setOpenId(null)} {...create} />
      <BatchDialogSlot templates={batchable} create={create} />
    </>
  )
}

type Translate = ReturnType<typeof useTranslations<'app.create'>>
const chipLabels = (t: Translate) => ({ all: t('all'), filter: t('filter'), filterWithin: (name: string) => t('filterWithin', { name }) })

// Search over every template the page holds, series members included (catalogue-search.ts).
function useCatalogueSearch(view: CatalogueView) {
  const [query, setQuery] = useState('')
  const index = useMemo(() => buildSearchIndex(view.entries, view.filters), [view])
  const results = useMemo(() => (query.trim() ? searchTemplates(index, query) : null), [index, query])
  return { query, setQuery, results }
}

type ResultsProps = { query: string; results: readonly CatalogueTemplate[]; endCard?: ReactNode; onOpen(id: string): void }

// Matches as plain template cards; none: a line, and the Wishlist's card when it is open.
function SearchResults({ query, results, endCard, onOpen }: ResultsProps) {
  const t = useTranslations('app.create')
  const entries = results.map((template): GridEntry => ({ type: 'template', template, path: [] }))
  return (
    <>
      <p aria-live="polite" className="px-(--gutter) pt-2 text-caption text-muted-foreground">
        {results.length ? t('searchResults', { query, count: results.length }) : t('searchEmpty', { query })}
      </p>
      <CatalogueGrid entries={entries} endCard={endCard} className="mt-3" onOpen={onOpen} onOpenSeries={() => undefined} />
    </>
  )
}

type BodyProps = Omit<GridProps, 'entries' | 'className'> & {
  search: ReturnType<typeof useCatalogueSearch>
  sections: CatalogueSection[] | null
  shown: readonly GridEntry[]
  onSeeAll(section: CatalogueSection): void
}

// A search replaces the sections and the chosen category's grid with its matches.
function CatalogueBody({ search, sections, shown, endCard, onOpen, onOpenSeries, onSeeAll }: BodyProps) {
  if (search.results) return <SearchResults query={search.query.trim()} results={search.results} endCard={endCard} onOpen={onOpen} />
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
