'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, type RefObject } from 'react'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { hasStills, isCompareCategory } from './catalogue-template'
import { shelfMembers } from './catalogue-shelves'
import type { CatalogueSeries } from './catalogue-view'
import { COVER_SIZES } from './cover-sizes'
import { TemplateCard } from './template-card'

type Props = {
  series: CatalogueSeries
  // The page's first shelf: its first card loads at once, at high priority unless the featured card
  // sits above (`priority` false). Only that one: on a slow phone the peeking second card's covers
  // shared the line with it and the page's largest paint came later (2026-11-25).
  first: boolean
  priority: boolean
  onOpen(id: string): void
  onOpenSeries(slug: string): void
}

// One series in a chosen category (Owner 2026-11-25): a section headed by the series' name,
// 「共 N 个」 and 「查看全部」 (the series panel, as a ?series= link opens it), over a row of its
// templates that scrolls sideways (CSS scroll-snap; swipe on phones, the arrows or Tab on a
// desktop), ending on 「+N 个」 when it holds more than SHELF_LIMIT. Drag compares (画风) cannot sit
// in a row that scrolls sideways, so a shelf of them is a grid instead.
export function SeriesShelf({ series, first, priority, onOpen, onOpenSeries }: Props) {
  const t = useTranslations('app.series')
  const rail = useRef<HTMLUListElement>(null)
  const shown = shelfMembers(series)
  const more = series.members.length - shown.length
  const compare = shown.every((template) => isCompareCategory(template) && hasStills(template))
  const headingId = `create-shelf-${series.id}`
  const open = () => onOpenSeries(series.slug)
  return (
    <section aria-labelledby={headingId} data-shelf={series.slug} className="min-w-0">
      <Reveal className="flex items-baseline gap-2 px-(--gutter)">
        <h3 id={headingId} className="min-w-0 truncate text-body leading-[1.25] font-semibold tracking-[-0.015em]">{series.name}</h3>
        <span className="shrink-0 font-mono text-caption text-muted-foreground">{t('shelfCount', { count: series.members.length })}</span>
        <span className="flex-1" />
        {compare ? null : <ScrollButtons rail={rail} name={series.name} />}
        <SeeAll name={series.name} onOpen={open} />
      </Reveal>
      <ul ref={rail} className={compare ? COMPARE_LIST : RAIL_LIST}>
        {shown.map((template, index) => (
          <li key={template.id} className={compare ? undefined : RAIL_ITEM}>
            <TemplateCard template={template} onOpen={onOpen} eager={first && index === 0} priority={priority && index === 0} sizes={compare ? COMPARE_SIZES : RAIL_SIZES} />
          </li>
        ))}
        {more > 0 ? (
          <li className={compare ? 'flex' : 'flex w-28 flex-none snap-start'}>
            <button type="button" onClick={open} aria-label={t('shelfMoreAria', { name: series.name, total: series.members.length })}
              className="press hairline flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-tile bg-wash text-caption font-medium">
              <span className="font-mono">{t('shelfMore', { count: more })}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

function SeeAll({ name, onOpen }: { name: string; onOpen(): void }) {
  const t = useTranslations('app.create')
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog"
      className="press -my-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-inner ps-2 text-caption font-medium text-foreground">
      {t('seeAll')}
      <span className="sr-only"> {t('seeAllWhich', { name })}</span>
      <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
    </button>
  )
}

// From md up a mouse has no sideways swipe: two arrows move the row by most of its width.
function ScrollButtons({ rail, name }: { rail: RefObject<HTMLUListElement | null>; name: string }) {
  const t = useTranslations('app.series')
  const by = (direction: 1 | -1) => {
    const element = rail.current
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' })
  }
  const style = 'press hidden size-9 shrink-0 items-center justify-center self-center rounded-full bg-wash text-foreground md:inline-flex'
  return (
    <>
      <button type="button" onClick={() => by(-1)} aria-label={t('scrollBack', { name })} className={style}><ChevronLeft aria-hidden className="size-4" /></button>
      <button type="button" onClick={() => by(1)} aria-label={t('scrollOn', { name })} className={style}><ChevronRight aria-hidden className="size-4" /></button>
    </>
  )
}

// relative: the row clips anything absolutely placed in its cards (as Create's All rails do).
const RAIL_LIST = cn(
  'no-scrollbar relative mt-2 flex snap-x snap-mandatory scroll-px-(--gutter) gap-3 overflow-x-auto px-(--gutter) pb-1',
  'md:mt-3 md:gap-4',
)
// A phone shows one card and the next one peeking; md two and a quarter; lg three and a quarter.
const RAIL_ITEM = 'w-[calc(100%-4rem)] max-w-96 flex-none snap-start md:w-[calc((100%-1rem)/2.25)] md:max-w-none lg:w-[calc((100%-2rem)/3.25)]'
const COMPARE_LIST = 'mt-2 grid grid-cols-2 gap-3 px-(--gutter) md:mt-3 md:grid-cols-3 md:gap-4'

const RAIL_SIZES = { plate: COVER_SIZES.shelfPlate, frame: COVER_SIZES.shelfFrame }
const COMPARE_SIZES = { art: COVER_SIZES.artSection }
