'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { ComponentType } from 'react'

import type { GridProps } from './template-catalogue'
import { categoryNameAt, shelveEntries, type ShelfLayout } from './catalogue-shelves'
import type { FilterNode } from './catalogue-view'
import { HoldCovers } from './near-viewport'
import { SeriesShelf } from './series-shelf'

// A chosen category (or All with a single category): its series as shelves, then the templates in
// no series as the grid (catalogue-shelves.ts says when a series is flattened into the grid).
// Loaded on its own (template-catalogue.tsx), so the pages that share Create's cards (Photos) do not
// carry it in their first load (scripts/js-budget.json).
// `Grid`: Create's grid, handed in so this chunk does not pull its module apart from the page's.
type Props = Omit<GridProps, 'className' | 'eagerCount' | 'seriesOf'> & { filters: readonly FilterNode[]; path: readonly string[]; Grid: ComponentType<GridProps> }
type ListProps = Omit<Props, 'entries' | 'filters' | 'path'> & { layout: ShelfLayout }

export default function ShelvedGrid({ entries, filters, path, ...rest }: Props) {
  const layout = useMemo(() => shelveEntries(entries, categoryNameAt(filters, path)), [entries, filters, path])
  const { Grid } = rest
  if (layout.shelves.length === 0) return <Grid entries={layout.grid} className="mt-2 md:mt-3" {...rest} />
  return <ShelfList layout={layout} {...rest} />
}

const HOLD_MAX_MS = 8_000
// Shelves drawn before the first covers have loaded: a desktop screen shows about two and a half.
const FIRST_SHELVES = 3

const settled = (img: HTMLImageElement) =>
  img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true })
    img.addEventListener('error', () => resolve(), { once: true })
  })

// Covers past the first screen are held (HoldCovers, near-viewport.tsx) until the first shelf's eager covers
// have loaded, or HOLD_MAX_MS, whichever is sooner.
function useHoldUntilFirst() {
  const first = useRef<HTMLLIElement>(null)
  const [held, setHeld] = useState(true)
  useEffect(() => {
    if (!held) return
    let live = true
    const release = () => { if (live) setHeld(false) }
    const timer = setTimeout(release, HOLD_MAX_MS)
    const eager = [...(first.current?.querySelectorAll<HTMLImageElement>('img[loading="eager"]') ?? [])]
    void Promise.all(eager.map(settled)).then(release)
    return () => { live = false; clearTimeout(timer) }
  }, [held])
  return { first, held }
}

function ShelfList({ layout, Grid, endCard, firstPriority = true, onOpen, onOpenSeries }: ListProps) {
  const { first, held } = useHoldUntilFirst()
  // While the first covers load, only the shelves a screen can show are drawn: drawing all of
  // them (six cards each) at once held the first covers back by about 1.2 s on a slow phone.
  const drawn = held ? layout.shelves.slice(0, FIRST_SHELVES) : layout.shelves
  return (
    <HoldCovers value={held}>
      <ul className="mt-2 grid gap-8 md:mt-3 md:gap-10">
        {drawn.map((series, index) => (
          <li key={series.id} ref={index === 0 ? first : undefined} className="min-w-0">
            <SeriesShelf series={series} first={index === 0} priority={firstPriority && index === 0} onOpen={onOpen} onOpenSeries={onOpenSeries} />
          </li>
        ))}
      </ul>
      {!held && (layout.grid.length || endCard) ? (
        <Grid entries={layout.grid} endCard={endCard} firstPriority={false} eagerCount={0} className="mt-8 md:mt-10" onOpen={onOpen} onOpenSeries={onOpenSeries} />
      ) : null}
    </HoldCovers>
  )
}
