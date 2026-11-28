'use client'

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState, type RefObject } from 'react'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { hasStills, isCompareCategory } from './catalogue-template'
import { phoneFirst, shelfMembers } from './catalogue-shelves'
import type { CatalogueSeries } from './catalogue-view'
import { COVER_SIZES, phone } from './cover-sizes'
import { TemplateCard } from './template-card'

type Props = {
  series: CatalogueSeries
  // The page's first shelf: its first card loads at once, at high priority unless the featured card
  // sits above (`priority` false). Only that one: on a slow phone the second card's covers
  // shared the line with it and the page's largest paint came later (2026-11-25).
  first: boolean
  priority: boolean
  onOpen(id: string): void
  onOpenSeries(slug: string): void
}

// One series in a chosen category (Owner 2026-11-25): a section headed by the series' name and
// 「共 N 个」 over its templates.
// From md: a row that scrolls sideways (CSS scroll-snap; the arrows or Tab), with 「查看全部」 (the
// series panel, as a ?series= link opens it) and a closing 「+N 个」 past SHELF_LIMIT.
// On a phone (Owner 2026-11-28): a two-column grid, two rows of a large series over a full-width
// 「展开其余 N 个」 that opens the rest in place (catalogue-shelves.ts phoneFirst). A sideways row
// showed one card and people took it for the whole series.
// Drag compares (画风) cannot sit in a row that scrolls sideways, so a shelf of them is a grid at
// every width, as before.
export function SeriesShelf({ series, first, priority, onOpen, onOpenSeries }: Props) {
  const t = useTranslations('app.series')
  const rail = useRef<HTMLUListElement>(null)
  const section = useRef<HTMLElement>(null)
  const [expanded, setExpanded] = useState(false)
  const total = series.members.length
  const shown = expanded ? series.members : shelfMembers(series)
  const more = total - shown.length
  const compare = shown.every((template) => isCompareCategory(template) && hasStills(template))
  const folded = compare ? total : phoneFirst(total)
  const headingId = `create-shelf-${series.id}`
  const open = () => onOpenSeries(series.slug)
  const toggle = () => {
    setExpanded(!expanded)
    // Closing a long series from its end: bring its heading back under the chip bar.
    if (expanded) requestAnimationFrame(() => backToTop(section.current))
  }
  return (
    <section ref={section} aria-labelledby={headingId} data-shelf={series.slug} className="min-w-0 scroll-mt-44">
      <Reveal className="flex items-baseline gap-2 px-(--gutter)">
        <h3 id={headingId} className="min-w-0 truncate text-body leading-[1.25] font-semibold tracking-[-0.015em]">{series.name}</h3>
        <span className="shrink-0 font-mono text-caption text-muted-foreground">{t('shelfCount', { count: total })}</span>
        <span className="flex-1" />
        {compare ? null : <ScrollButtons rail={rail} name={series.name} />}
        <SeeAll name={series.name} onOpen={open} className={compare ? 'inline-flex' : 'hidden md:inline-flex'} />
      </Reveal>
      <ul ref={rail} className={compare ? COMPARE_LIST : RAIL_LIST}>
        {shown.map((template, index) => (
          <li key={template.id} className={compare ? undefined : cn(RAIL_ITEM, index >= folded && !expanded && 'max-md:hidden')}>
            <TemplateCard template={template} onOpen={onOpen} eager={first && index === 0} priority={priority && index === 0} sizes={compare ? COMPARE_SIZES : RAIL_SIZES} />
          </li>
        ))}
        {more > 0 ? (
          <li className={compare ? 'flex' : 'hidden w-28 flex-none snap-start md:flex'}>
            <button type="button" onClick={open} aria-label={t('shelfMoreAria', { name: series.name, total })}
              className="press hairline flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-tile bg-wash text-caption font-medium">
              <span className="font-mono">{t('shelfMore', { count: more })}</span>
            </button>
          </li>
        ) : null}
      </ul>
      {total > folded ? <ExpandButton name={series.name} rest={total - folded} expanded={expanded} onToggle={toggle} /> : null}
    </section>
  )
}

// Phones only: the rest of the series, opened below its first two rows and closed again.
function ExpandButton({ name, rest, expanded, onToggle }: { name: string; rest: number; expanded: boolean; onToggle(): void }) {
  const t = useTranslations('app.series')
  const which = useTranslations('app.create')('seeAllWhich', { name })
  return (
    <div className="mt-4 px-(--gutter) md:hidden">
      <button type="button" aria-expanded={expanded} onClick={onToggle}
        className="press hairline flex min-h-11 w-full items-center justify-center gap-1.5 rounded-button bg-wash text-label font-semibold">
        {expanded ? t('shelfCollapse') : t('shelfExpand', { count: rest })}
        <span className="sr-only"> {which}</span>
        <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform duration-250 ease-house', expanded && 'rotate-180')} />
      </button>
    </div>
  )
}

// Only when the heading has gone above the chip bar (scroll-mt-44 on the section clears the bar).
const BAR_CLEARANCE = 176
function backToTop(section: HTMLElement | null) {
  if (section && section.getBoundingClientRect().top < BAR_CLEARANCE) section.scrollIntoView({ block: 'start' })
}

function SeeAll({ name, onOpen, className }: { name: string; onOpen(): void; className: string }) {
  const t = useTranslations('app.create')
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog"
      className={cn('press -my-2 min-h-11 shrink-0 items-center gap-1 rounded-inner ps-2 text-caption font-medium text-foreground', className)}>
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

// A phone: two columns that only scroll with the page. From md the row scrolls sideways.
// relative: the row clips anything absolutely placed in its cards (as Create's All rails do).
const RAIL_LIST = cn(
  'relative mt-2 grid grid-cols-2 gap-x-3 gap-y-5 px-(--gutter)',
  'no-scrollbar md:mt-3 md:flex md:snap-x md:snap-mandatory md:scroll-px-(--gutter) md:gap-4 md:overflow-x-auto md:pb-1',
)
// From md two and a quarter cards; lg three and a quarter. On a phone the card is half the row, so
// its name wraps to two lines at most and the category line (the chip bar already says it) is dropped.
const RAIL_ITEM = cn(
  'min-w-0 max-md:[&_[data-kind]]:hidden max-md:[&_[data-name]]:line-clamp-2 max-md:[&_[data-name]]:text-label',
  'md:w-[calc((100%-1rem)/2.25)] md:flex-none md:snap-start lg:w-[calc((100%-2rem)/3.25)]',
)
const COMPARE_LIST = 'mt-2 grid grid-cols-2 gap-3 px-(--gutter) md:mt-3 md:grid-cols-3 md:gap-4'

// Cover widths in a shelf (kept here, not in cover-sizes.ts, so they load with the shelves): a
// phone card is half the row, so a plate is about 22vw (82 px on a 375 px phone: the 256 w file);
// from md a row shows two and a quarter cards (about 44vw each), from lg three and a quarter (335 px).
const RAIL_SIZES = {
  plate: `(min-width: 1024px) 168px, (min-width: 768px) 22vw, ${phone(22)}`,
  frame: `(min-width: 1024px) 335px, (min-width: 768px) 44vw, ${phone(44)}`,
}
const COMPARE_SIZES = { art: COVER_SIZES.artSection }
