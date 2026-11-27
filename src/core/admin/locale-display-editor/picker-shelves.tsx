'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/core/ui/button'

import type { DisplayLocale } from '../locale-display/types'
import type { AdminTemplate } from '../templates/types'
import { PickerCard } from './picker-card'
import { PICKER_COPY as COPY } from './picker-copy'
import type { SeriesShelf } from './picker-filter'

// Rendered in pages so a catalogue of hundreds stays quick; covers load lazily at thumbnail size.
const PAGE = 48
// A shelf shows one row of the widest grid; the rest are one click away.
const SHELF = 5
const SHELVES = 12

export type CardsProps = {
  locale: DisplayLocale
  taken: ReadonlySet<string>
  picked: readonly string[]
  placeOf: (template: AdminTemplate) => string
  toggle: (id: string) => void
}

function Cards({ templates, cards }: { templates: readonly AdminTemplate[]; cards: CardsProps }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {templates.map((template) => (
        <PickerCard key={template.id} template={template} place={cards.placeOf(template)} locale={cards.locale} taken={cards.taken.has(template.id)}
          selected={cards.picked.includes(template.id)} onToggle={() => cards.toggle(template.id)} />
      ))}
    </ul>
  )
}

function More({ onClick, label }: { onClick: () => void; label: string }) {
  return <div className="flex justify-center py-3"><Button size="sm" variant="outline" onClick={onClick}>{label}</Button></div>
}

// Every match as one grid: an opened series, or results that are all in one shelf.
export function PickerGrid({ templates, cards }: { templates: readonly AdminTemplate[]; cards: CardsProps }) {
  const [limit, setLimit] = useState(PAGE)
  return (
    <>
      <Cards templates={templates.slice(0, limit)} cards={cards} />
      {templates.length > limit ? <More onClick={() => setLimit(limit + PAGE)} label={COPY.more} /> : null}
    </>
  )
}

// The matches series by series: each shelf's name and count, its first row of covers, and a way
// into the whole series. Covers stay pickable right on the shelf.
export function PickerShelves({ shelves, cards, onOpen }: { shelves: readonly SeriesShelf[]; cards: CardsProps; onOpen: (id: string) => void }) {
  const [limit, setLimit] = useState(SHELVES)
  return (
    <div className="grid grid-cols-1 gap-4">
      {shelves.slice(0, limit).map((shelf) => {
        const chosen = shelf.templates.filter((template) => cards.picked.includes(template.id)).length
        return (
          <section key={shelf.id} aria-label={shelf.name} className="grid grid-cols-1 gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" className="min-w-0 truncate text-sm font-medium hover:underline" onClick={() => onOpen(shelf.id)}>{shelf.name}</button>
              <span className="text-xs text-muted-foreground">{COPY.shelfCount(shelf.templates.length, chosen)}</span>
              {shelf.templates.length > SHELF ? (
                <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => onOpen(shelf.id)}>
                  {COPY.openShelf(shelf.templates.length)}<ChevronRight aria-hidden />
                </Button>
              ) : null}
            </div>
            <Cards templates={shelf.templates.slice(0, SHELF)} cards={cards} />
          </section>
        )
      })}
      {shelves.length > limit ? <More onClick={() => setLimit(limit + SHELVES)} label={COPY.moreShelves} /> : null}
    </div>
  )
}

export function SeriesHeader({ name, count, onBack }: { name: string; count: number; onBack: () => void }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" className="h-7" onClick={onBack}><ChevronLeft aria-hidden />{COPY.back}</Button>
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground">{COPY.shelfCount(count, 0)}</span>
    </div>
  )
}
