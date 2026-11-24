'use client'

import type { ReactNode } from 'react'

import { cn } from '@/core/ui/cn'
import { Reveal } from '@/core/ui/reveal-item'

import { isTall } from './catalogue-sections'
import type { GridEntry } from './catalogue-view'
import { SeriesCard } from './series-card'
import { TemplateCard } from './template-card'

// `firstPriority`: the first card is the page's largest paint, so its covers load at high priority;
// false when the featured card or a shelf sits above it.
// `seriesOf`: search results name each member's series on its card (template id → series name).
export type GridProps = {
  entries: readonly GridEntry[]
  endCard?: ReactNode
  firstPriority?: boolean
  // Cards drawn at once (not waiting to come near the screen); none when shelves sit above.
  eagerCount?: number
  seriesOf?: ReadonlyMap<string, string>
  className: string
  onOpen(id: string): void
  onOpenSeries(slug: string): void
}

// The flat grid: a chosen category's loose templates, Saved, search results, or All with a single category.
export function CatalogueGrid({ entries, endCard, firstPriority = true, eagerCount = 3, seriesOf, className, onOpen, onOpenSeries }: GridProps) {
  return (
    <ul className={cn('grid grid-flow-row-dense grid-cols-1 gap-x-3 gap-y-6 px-(--gutter) md:grid-cols-2 md:gap-x-4 lg:grid-cols-3', className)}>
      {entries.map((entry, index) => (
        <Reveal as="li" key={entryKey(entry)} className={cn(isTall(entry) && 'md:row-span-2')}>
          {entry.type === 'series' ? (
            <SeriesCard series={entry.series} onOpen={() => onOpenSeries(entry.series.slug)} eager={index < eagerCount} priority={firstPriority && index === 0} />
          ) : (
            <TemplateCard template={entry.template} onOpen={onOpen} eager={index < eagerCount} priority={firstPriority && index === 0} series={seriesOf?.get(entry.template.id)} />
          )}
        </Reveal>
      ))}
      {endCard ? <Reveal as="li">{endCard}</Reveal> : null}
    </ul>
  )
}

export const entryKey = (entry: GridEntry) => (entry.type === 'series' ? `series-${entry.series.id}` : entry.template.id)
