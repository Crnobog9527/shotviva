'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'

import { trackCatalogueSeeAll } from '@/core/analytics/browser'
import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { BatchDialogSlot } from '../matrix/batch-dialog-slot'
import { CreateDialog, type CreateContext } from '../workspace/create-dialog'
import { filterCatalogue } from './catalogue-filter'
import { buildSearchIndex, searchTemplates } from './catalogue-search'
import type { CataloguePayload } from './catalogue-payload'
import { catalogueSections, isTall, sectionsFor, type CatalogueSection } from './catalogue-sections'
import { CatalogueSections } from './catalogue-sections-view'
import { batchableTemplates, isMotion, type CatalogueTemplate } from './catalogue-template'
import { findSeries, type CatalogueView, type GridEntry } from './catalogue-view'
import { CategoryChips } from './category-chips'
import { isPosterIn, PosterDialogSlot } from './poster-dialog-slot'
import { posterSeriesOf, posterStart } from './poster-series'
import { SavedEmpty } from './saved-empty'
import { SearchBox } from './search-box'
import { FeatureCard } from './feature-card'
import { FirstScreenCovers } from './near-viewport'
import { SeriesCard } from './series-card'
import { TemplateCard } from './template-card'
import { ShareModeButton } from '../template-share/share-mode-button'
import { ShareSelectionProvider, useShareSelectionState, type ShareSelection } from '../template-share/share-selection'
import { useSeeAllLanding } from './use-see-all-landing'
import { useCatalogueQuery } from './use-catalogue-query'
import { useSettled } from './use-settled'
import { browseView, slimBrowse } from './picker-browse'

// The series panel is only fetched once a series is opened (scripts/js-budget.json).
// Share mode's bar and sheet (§5.1g) only once share mode is turned on.
const ShareModeChrome = dynamic(() => import('../template-share/share-mode').then((m) => m.ShareModeChrome), { ssr: false })
const SeriesCreateDialog = dynamic(() => import('../workspace/series-create-dialog').then((m) => m.SeriesCreateDialog), { ssr: false })

// `endCard`: the grid's last card, after every filter's cards (the Wishlist's "Not finding it?",
// passed in by the page while the wishlist is open).
// `create`: what the creation dialogs need for this account (balance, tier, limits). Create streams
// it after the grid (a promise): the grid shows at once, and a card tapped before it arrives opens
// its dialog when it does, so nothing can be generated against a balance not yet known.
type Props = { payload: CataloguePayload; create: CreateContext | Promise<CreateContext>; endCard?: ReactNode }


// Create's catalogue (B comp create.html): the featured card, a sticky chip bar of up to three
// category levels (T102), the grid of side-by-side pair cards and series cards (one column on
// phones, two from md, three from lg; the Art Styles compare is the tall card), the series panel
// a series card opens (its members and the chosen one's form in one step, Owner 2026-11-12), and
// the creation dialog every template opens (DESIGN §6.9 item 2), and Batch create's dialog
// (?batch=1, opened by the card above the catalogue or a template's batch link). The
// chosen category and an open series live in the address (?category=, ?series=). With saved
// templates the bar leads with Saved (T83), read from the page's FavoritesProvider.
export function TemplateCatalogue({ payload, create: createProp, endCard }: Props) {
  const t = useTranslations('app.create')
  const create = useSettled(createProp)
  const view = useMemo(() => browseView(payload.browse, payload.templates, false), [payload])
  const query = useCatalogueQuery(view.filters)
  const [openId, setOpenId] = useState<string | null>(null)
  const openable = payload.templates
  const batchable = useMemo(() => batchableTemplates(openable), [openable])
  const batchBrowse = useMemo(() => slimBrowse(view), [view])
  // A poster template's card opens its editor dialog, kept in the address (?poster=<id>, where
  // old /posters/<id> links land too); every other card opens the creation dialog.
  const share = useShareSelectionState()
  const { open, openSeries } = useOpeners(share, view, query, (id) => (isPosterIn(openable, id) ? query.openPoster(id) : setOpenId(id)))
  const featured = featuredOf(view.entries)
  const favorites = useFavorites()
  const favoriteIds = favorites?.ids
  const saved = useMemo(() => (favoriteIds ? savedIn(favoriteIds, openable) : []), [favoriteIds, openable])
  const { active, shown } = filterCatalogue(view.entries, saved, query.selection)
  const series = useOpenSeries(view.entries, query)
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
        <BatchSlot templates={batchable} browse={batchBrowse} create={create} />
      </>
    )
  }
  return (
    <ShareSelectionProvider value={share}>
      <FirstScreenCovers screen={firstScreenOf(search.results !== null, active)}>
        {featured ? (
          <Reveal className="px-(--gutter)">
            <FeatureCard template={featured} onOpen={open} />
          </Reveal>
        ) : null}
        <div ref={sentinel} aria-hidden="true" className="mt-4 h-px md:mt-6" />
        <div ref={bar} data-stuck={stuck || undefined} data-chrome="" className="sticky top-0 z-40 py-2 data-[stuck]:chrome-bleed data-[stuck]:pt-[calc(var(--sat)+8px)] md:top-14 md:data-[stuck]:pt-2">
          <div className="mb-2 flex items-center gap-2 px-(--gutter)">
            <SearchBox value={search.query} onChange={search.setQuery} label={t('search')} clear={t('searchClear')} className="min-w-0 flex-1 md:max-w-[420px]" />
            <ShareModeButton />
          </div>
          <CategoryChips hidden={search.results !== null} filters={view.filters} saved={showSaved(saved.length, active.saved, holdsSaved(favorites))} value={active} onChange={query.select} labels={chipLabels(t)} />
        </div>
        <h2 className="sr-only">{t('templates')}</h2>
        <CatalogueBody search={search} sections={sectionsFor(active, sections)} shown={shown} saved={active.saved} onBrowse={() => query.select({ saved: false, path: [] })} endCard={endCard} onOpen={open} onOpenSeries={openSeries} onSeeAll={seeAll} />
        <p className="px-(--gutter) pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">{t('illustrative')}</p>
        <CatalogueDialogs
          create={create}
          series={sheetLoaded ? series : undefined}
          onCloseSeries={query.closeSeries}
          template={openable.find((item) => item.id === openId) ?? null}
          onCloseTemplate={() => setOpenId(null)}
          poster={{ id: query.posterId, templates: openable, series: posterSeriesOf(view.entries, query.posterId), onSwitch: query.openPoster, onClose: query.closePoster }}
          batch={{ templates: batchable, browse: batchBrowse }}
        />
        <ShareModeSlot selection={share} />
      </FirstScreenCovers>
    </ShareSelectionProvider>
  )
}

type DialogsProps = {
  create: CreateContext | null
  // undefined until the series panel was first opened (it is fetched on demand).
  series: ReturnType<typeof useOpenSeries> | undefined
  onCloseSeries(): void
  template: CatalogueTemplate | null
  onCloseTemplate(): void
  poster: Omit<ComponentProps<typeof PosterDialogSlot>, 'create'>
  batch: Omit<ComponentProps<typeof BatchDialogSlot>, 'create'>
}

// The dialogs a card, a series or a poster opens, and Batch create: mounted once the account's
// create context is here, so a card tapped earlier opens as soon as it lands.
function CatalogueDialogs({ create, series, onCloseSeries, template, onCloseTemplate, poster, batch }: DialogsProps) {
  if (!create) return null
  return (
    <>
      {series !== undefined ? <SeriesCreateDialog series={series} onClose={onCloseSeries} {...create} /> : null}
      <CreateDialog template={template} onClose={onCloseTemplate} {...create} />
      <PosterDialogSlot {...poster} create={create} />
      <BatchDialogSlot {...batch} create={create} />
    </>
  )
}

const BatchSlot = ({ create, ...batch }: Omit<ComponentProps<typeof BatchDialogSlot>, 'create'> & { create: CreateContext | null }) =>
  create ? <BatchDialogSlot {...batch} create={create} /> : null

// While the saved list is on its way, hold the Saved chip's place if this browser last saw one.
const holdsSaved = (favorites: ReturnType<typeof useFavorites>) => favorites?.pending === true && favorites.hinted === true

// A card's tap: in share mode (§5.1g) it picks the card instead of opening it; poster templates
// (and series of them) are never shared, so they do nothing then.
function useOpeners(share: ShareSelection, view: CatalogueView, query: ReturnType<typeof useCatalogueQuery>, openCard: (id: string) => void) {
  const posterIds = useMemo(() => new Set(view.entries.flatMap(posterIdsOf)), [view.entries])
  const open = (id: string) => {
    if (!share.selecting) return openCard(id)
    if (!posterIds.has(id)) share.toggle({ type: 'template', id })
  }
  const openSeries = (slug: string) => {
    if (!share.selecting) return query.openSeries(slug)
    const found = findSeries(view.entries, slug)
    if (found && !posterStart(found)) share.toggle({ type: 'series', id: found.id })
  }
  return { open, openSeries }
}

// The bar and sheet are fetched the first time share mode is turned on.
const ShareModeSlot = ({ selection }: { selection: ShareSelection }) => (selection.selecting ? <ShareModeChrome selection={selection} /> : null)

const posterIdsOf = (entry: GridEntry): string[] =>
  (entry.type === 'series' ? entry.series.members : [entry.template]).filter((template) => template.poster).map((template) => template.id)

// A series of poster templates opens the poster editor (with its styles to switch between),
// from its card or from a ?series= link alike; any other series opens the series panel.
function useOpenSeries(entries: CatalogueView['entries'], query: ReturnType<typeof useCatalogueQuery>) {
  const found = findSeries(entries, query.seriesKey)
  const seriesPoster = posterStart(found)
  const { openPoster } = query
  useEffect(() => { if (seriesPoster) openPoster(seriesPoster) }, [seriesPoster, openPoster])
  return seriesPoster ? null : found
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
  // Saved is chosen: when it holds nothing, its empty state with the way back to All.
  saved: boolean
  onBrowse(): void
  onSeeAll(section: CatalogueSection): void
}

// The Saved chip shows while something is saved, and stays while Saved is chosen (我的收藏). While
// the list is still on its way it keeps its place if this browser last saw saved templates, so
// the chip bar does not shift when the list lands.
const showSaved = (count: number, chosen: boolean, held = false) => count > 0 || chosen || held

// A search replaces the sections and the chosen category's grid with its matches; Saved with
// nothing saved shows its empty state.
function CatalogueBody({ search, sections, shown, saved, onBrowse, endCard, onOpen, onOpenSeries, onSeeAll }: BodyProps) {
  if (search.results) return <SearchResults query={search.query.trim()} results={search.results} endCard={endCard} onOpen={onOpen} />
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

// The screen whose first-screen covers the service worker keeps (near-viewport.tsx): All, a
// category path, or Saved; none for search results.
function firstScreenOf(searching: boolean, active: { saved: boolean; path: readonly string[] }): string | null {
  if (searching) return null
  if (active.saved) return 'saved'
  return active.path.length ? `c:${active.path.join('/')}` : 'all'
}

// The featured card: the first single video template in the catalogue's order.
function featuredOf(entries: readonly GridEntry[]) {
  for (const entry of entries) if (entry.type === 'template' && isMotion(entry.template) && entry.template.cover.type === 'video') return entry.template
  return null
}

const entryKey = (entry: GridEntry) => (entry.type === 'series' ? `series-${entry.series.id}` : entry.template.id)

// True once the chip bar has stuck to the top: only then does it pad for the top safe area and
// take its bar material (chrome-bleed, globals-body.css), so at rest there is no band over the ground (or the living background,
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
