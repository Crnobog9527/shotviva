'use client'

import { useMemo } from 'react'

import { CatalogueGrid, type GridProps } from './catalogue-grid'
import { HoldCovers, useHoldUntilFirst } from './hold-covers'
import { categoryNameAt, shelveEntries } from './catalogue-shelves'
import type { FilterNode } from './catalogue-view'
import { SeriesShelf } from './series-shelf'

type Props = Omit<GridProps, 'className' | 'eagerCount' | 'seriesOf'> & { filters: readonly FilterNode[]; path: readonly string[] }

// A chosen category (or All with a single category): its series as shelves, then the templates in
// no series as the grid (catalogue-shelves.ts says when a series is flattened into the grid).
export function ShelvedGrid({ entries, filters, path, endCard, firstPriority = true, onOpen, onOpenSeries }: Props) {
  const layout = useMemo(() => shelveEntries(entries, categoryNameAt(filters, path)), [entries, filters, path])
  const { first, held } = useHoldUntilFirst()
  // While the first covers load, only the shelves a screen can show are drawn: drawing all of
  // them (six cards each) at once held the first covers back by about 1.2 s on a slow phone.
  const drawn = held ? layout.shelves.slice(0, FIRST_SHELVES) : layout.shelves
  if (layout.shelves.length === 0) {
    return <CatalogueGrid entries={layout.grid} endCard={endCard} firstPriority={firstPriority} className="mt-2 md:mt-3" onOpen={onOpen} onOpenSeries={onOpenSeries} />
  }
  return (
    <HoldCovers held={held}>
      <ul className="mt-2 grid gap-8 md:mt-3 md:gap-10">
        {drawn.map((series, index) => (
          <li key={series.id} ref={index === 0 ? first : undefined} className="min-w-0">
            <SeriesShelf series={series} first={index === 0} priority={firstPriority && index === 0} onOpen={onOpen} onOpenSeries={onOpenSeries} />
          </li>
        ))}
      </ul>
      {!held && (layout.grid.length || endCard) ? (
        <CatalogueGrid entries={layout.grid} endCard={endCard} firstPriority={false} eagerCount={0} className="mt-8 md:mt-10" onOpen={onOpen} onOpenSeries={onOpenSeries} />
      ) : null}
    </HoldCovers>
  )
}

// Shelves drawn before the first covers have loaded: a desktop screen shows about two and a half.
const FIRST_SHELVES = 3
