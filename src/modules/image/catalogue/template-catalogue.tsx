'use client'

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { useFavorites } from '../favorites/favorites-provider'
import { savedIn } from '../favorites/favorites-store'
import { CreateDialog, type CreateContext } from '../workspace/create-dialog'
import { filterCatalogue, openableTemplates } from './catalogue-filter'
import { hasStills, isCompareCategory, isMotion } from './catalogue-template'
import { findSeries, type CatalogueView, type GridEntry } from './catalogue-view'
import { CategoryChips } from './category-chips'
import { FeatureCard } from './feature-card'
import { SeriesCard } from './series-card'
import { TemplateCard } from './template-card'
import { useCatalogueQuery } from './use-catalogue-query'

// The series sheet is only fetched once a series is opened (scripts/js-budget.json).
const SeriesSheet = dynamic(() => import('./series-sheet').then((m) => m.SeriesSheet), { ssr: false })

// `endCard`: the grid's last card, after every filter's cards (the Wishlist's "Not finding it?",
// passed in by the page while the wishlist is open).
type Props = { view: CatalogueView; create: CreateContext; endCard?: ReactNode }

// Create's catalogue (B comp create.html): the featured card, a sticky chip bar of up to three
// category levels (T102), the grid of side-by-side pair cards and series cards (one column on
// phones, two from md, three from lg; the Art Styles compare is the tall card), the series sheet
// a series card opens, and the creation dialog every template opens (DESIGN §6.9 item 2). The
// chosen category and an open series live in the address (?category=, ?series=). With saved
// templates the bar leads with Saved (T83), read from the page's FavoritesProvider.
export function TemplateCatalogue({ view, create, endCard }: Props) {
  const t = useTranslations('app.create')
  const query = useCatalogueQuery(view.filters)
  const [openId, setOpenId] = useState<string | null>(null)
  const openable = useMemo(() => openableTemplates(view.entries), [view.entries])
  const featured = featuredOf(view.entries)
  const favoriteIds = useFavorites()?.ids
  const saved = useMemo(() => (favoriteIds ? savedIn(favoriteIds, openable) : []), [favoriteIds, openable])
  const { active, shown } = filterCatalogue(view.entries, saved, query.selection)
  const series = findSeries(view.entries, query.seriesKey)
  // Once loaded the sheet stays mounted, so closing it can play its motion.
  const [sheetLoaded, setSheetLoaded] = useState(false)
  if (series && !sheetLoaded) setSheetLoaded(true)
  const { sentinel, stuck } = useStuck()

  if (view.entries.length === 0) {
    return <p className="px-(--gutter) pt-6 text-body text-muted-foreground">{t('empty')}</p>
  }
  return (
    <>
      {featured ? (
        <Reveal className="px-(--gutter)">
          <FeatureCard template={featured} onOpen={setOpenId} />
        </Reveal>
      ) : null}
      <div ref={sentinel} aria-hidden="true" className="mt-4 h-px md:mt-6" />
      <div data-stuck={stuck || undefined} className="sticky top-0 z-40 py-2 data-[stuck]:nav-material data-[stuck]:pt-[calc(var(--sat)+8px)] md:top-14 md:data-[stuck]:pt-2">
        <CategoryChips filters={view.filters} saved={saved.length > 0} value={active} onChange={query.select} />
      </div>
      <h2 className="sr-only">{t('templates')}</h2>
      <ul className="mt-2 grid grid-flow-row-dense grid-cols-1 gap-x-3 gap-y-6 px-(--gutter) md:mt-3 md:grid-cols-2 md:gap-x-4 lg:grid-cols-3">
        {shown.map((entry, index) => (
          <Reveal as="li" key={entryKey(entry)} className={cn(isTall(entry) && 'md:row-span-2')}>
            {entry.type === 'series' ? (
              <SeriesCard series={entry.series} onOpen={() => query.openSeries(entry.series.slug)} eager={index < 3} />
            ) : (
              <TemplateCard template={entry.template} onOpen={setOpenId} eager={index < 3} />
            )}
          </Reveal>
        ))}
        {endCard ? <Reveal as="li">{endCard}</Reveal> : null}
      </ul>
      <p className="px-(--gutter) pt-4 pb-2 text-caption leading-[1.4] text-muted-foreground">{t('illustrative')}</p>
      {sheetLoaded ? (
        <SeriesSheet
          series={series}
          onClose={query.closeSeries}
          onPick={(template) => {
            query.closeSeries()
            setOpenId(template.id)
          }}
        />
      ) : null}
      <CreateDialog template={openable.find((item) => item.id === openId) ?? null} onClose={() => setOpenId(null)} {...create} />
    </>
  )
}

// The featured card: the first single video template in the catalogue's order.
function featuredOf(entries: readonly GridEntry[]) {
  for (const entry of entries) if (entry.type === 'template' && isMotion(entry.template) && entry.template.cover.type === 'video') return entry.template
  return null
}

const entryKey = (entry: GridEntry) => (entry.type === 'series' ? `series-${entry.series.id}` : entry.template.id)
const isTall = (entry: GridEntry) => entry.type === 'template' && isCompareCategory(entry.template) && hasStills(entry.template)

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
