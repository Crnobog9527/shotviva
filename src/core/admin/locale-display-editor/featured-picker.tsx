'use client'

import { Plus } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'

import type { DisplayLocale } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { PICKER_COPY as COPY } from './picker-copy'
import { categoryOptions, NOT_IN_SERIES, pickerResults, seriesShelves, type SeriesShelf } from './picker-filter'
import { usePickerSeriesNames } from './picker-series'
import { PickerGrid, PickerShelves, SeriesHeader, type CardsProps } from './picker-shelves'

type Props = {
  locale: DisplayLocale
  label: string
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  // The draft's current list: those are marked, not offered again.
  taken: readonly string[]
  onAdd: (ids: string[]) => void
  // At most this many picks (the 「更多真实案例」 slots left); further ticks are ignored.
  max?: number
  // The window's words when it adds to another list than 首页精选.
  text?: PickerText
}

export type PickerText = { open: string; title: (label: string) => string; description: string; add: (count: number) => string }

// 添加精选模板 as a window with covers, search and the category tree (Owner 2026-11-25), instead of
// one dropdown of every name. Picks go into the draft, in the order they were ticked.
export function FeaturedPicker({ locale, label, templates, categories, taken, onAdd, max, text = COPY }: Props) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) setPicked([])
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <Button size="sm" variant="outline" className="justify-self-start" disabled={max === 0} onClick={() => setOpen(true)}><Plus aria-hidden />{text.open}</Button>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 p-4 sm:max-w-5xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{text.title(label)}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        {open ? <PickerBody locale={locale} templates={templates} categories={categories} taken={taken} picked={picked} setPicked={setPicked} max={max} /> : null}
        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">{COPY.selected(picked.length)}</span>
          <div className="ml-auto flex gap-2">
            {picked.length ? <Button size="sm" variant="ghost" onClick={() => setPicked([])}>{COPY.clear}</Button> : null}
            <Button size="sm" variant="outline" onClick={() => close(false)}>{COPY.cancel}</Button>
            <Button size="sm" disabled={!picked.length} onClick={() => { onAdd(picked); close(false) }}>{text.add(picked.length)}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type PickerBodyProps = Omit<Props, 'label' | 'onAdd' | 'max' | 'text'> & {
  picked: string[]
  setPicked: (update: (current: string[]) => string[]) => void
  // At most this many picks (a bundle's eight); further ticks are ignored.
  max?: number
}

// The searchable grid of covers, shared with the 精选组合 window (bundle-dialog.tsx). Matches are
// shown as series shelves; a shelf opens to the whole series (Owner 2026-11-27).
export function PickerBody({ locale, templates, categories, taken, picked, setPicked, max = Infinity }: PickerBodyProps) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [series, setSeries] = useState<string | null>(null)
  const query = useDeferredValue(text)
  const seriesNames = usePickerSeriesNames()
  const options = useMemo(() => categoryOptions(categories), [categories])
  const results = useMemo(() => pickerResults(templates, categories, { text: query, category, series, seriesNames }),
    [templates, categories, query, category, series, seriesNames])
  const shelves = useMemo(() => seriesShelves(results, seriesNames, COPY.notInSeries), [results, seriesNames])
  const placeOf = (template: AdminTemplate) =>
    options.find((option) => option.key === (template.subcategoryKey ?? template.category))?.label ?? template.categoryInfo.nameZh
  const toggle = (id: string) => setPicked((current) =>
    current.includes(id) ? current.filter((other) => other !== id) : current.length >= max ? current : [...current, id])
  const cards: CardsProps = { locale, taken: new Set(taken), picked, placeOf, toggle }
  // A view's paging restarts whenever what it shows changes.
  const view = `${query}\n${category ?? ''}\n${series ?? ''}`
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" value={text} placeholder={COPY.search} aria-label={COPY.search} className="h-9 min-w-0 flex-1 basis-48"
          onChange={(event) => setText(event.target.value)} />
        <select aria-label={COPY.category} className="h-9 min-w-0 max-w-full flex-1 basis-40 rounded-md border bg-background px-2 text-sm" value={category ?? ''}
          onChange={(event) => { setCategory(event.target.value || null); setSeries(null) }}>
          <option value="">{COPY.allCategories}</option>
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{COPY.total(results.length, series ? null : seriesCount(shelves))}</span>
      </div>
      <PickerResults key={view} results={results} shelves={shelves} series={series} seriesNames={seriesNames} cards={cards} setSeries={setSeries} />
    </div>
  )
}

const seriesCount = (shelves: SeriesShelf[]) => shelves.filter((shelf) => shelf.id !== NOT_IN_SERIES).length

type ResultsProps = {
  results: AdminTemplate[]
  shelves: SeriesShelf[]
  series: string | null
  seriesNames: ReadonlyMap<string, string>
  cards: CardsProps
  setSeries: (id: string | null) => void
}

// The shelves, or one plain grid (in the series' own order) when every match sits on the same
// shelf: an opened series, or a category without series.
function PickerResults({ results, shelves, series, seriesNames, cards, setSeries }: ResultsProps) {
  const name = series === NOT_IN_SERIES ? COPY.notInSeries : series && (seriesNames.get(series) ?? series)
  return (
    <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
      {name ? <SeriesHeader name={name} count={results.length} onBack={() => setSeries(null)} /> : null}
      {results.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{COPY.none}</p> : null}
      {shelves.length > 1 ? <PickerShelves shelves={shelves} cards={cards} onOpen={setSeries} /> : <PickerGrid templates={shelves[0]?.templates ?? []} cards={cards} />}
    </div>
  )
}
