'use client'

import { Plus } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'

import type { DisplayLocale } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { PickerCard } from './picker-card'
import { PICKER_COPY as COPY } from './picker-copy'
import { categoryOptions, pickerResults } from './picker-filter'

type Props = {
  locale: DisplayLocale
  label: string
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  // The draft's current list: those are marked, not offered again.
  taken: readonly string[]
  onAdd: (ids: string[]) => void
}

// Rendered in pages so a catalogue of hundreds stays quick; covers load lazily at thumbnail size.
const PAGE = 48

// 添加精选模板 as a window with covers, search and the category tree (Owner 2026-11-25), instead of
// one dropdown of every name. Picks go into the draft, in the order they were ticked.
export function FeaturedPicker({ locale, label, templates, categories, taken, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) setPicked([])
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setOpen(true)}><Plus aria-hidden />{COPY.open}</Button>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 p-4 sm:max-w-5xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{COPY.title(label)}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        {open ? <PickerBody locale={locale} templates={templates} categories={categories} taken={taken} picked={picked} setPicked={setPicked} /> : null}
        <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">{COPY.selected(picked.length)}</span>
          <div className="ml-auto flex gap-2">
            {picked.length ? <Button size="sm" variant="ghost" onClick={() => setPicked([])}>{COPY.clear}</Button> : null}
            <Button size="sm" variant="outline" onClick={() => close(false)}>{COPY.cancel}</Button>
            <Button size="sm" disabled={!picked.length} onClick={() => { onAdd(picked); close(false) }}>{COPY.add(picked.length)}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = Omit<Props, 'label' | 'onAdd'> & { picked: string[]; setPicked: (update: (current: string[]) => string[]) => void }

function PickerBody({ locale, templates, categories, taken, picked, setPicked }: BodyProps) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const query = useDeferredValue(text)
  const options = useMemo(() => categoryOptions(categories), [categories])
  const results = useMemo(() => pickerResults(templates, categories, { text: query, category }), [templates, categories, query, category])
  const takenSet = new Set(taken)
  const placeOf = (template: AdminTemplate) =>
    options.find((option) => option.key === (template.subcategoryKey ?? template.category))?.label ?? template.categoryInfo.nameZh
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]))
  const reset = (apply: () => void) => {
    apply()
    setLimit(PAGE)
  }
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" value={text} placeholder={COPY.search} aria-label={COPY.search} className="h-9 min-w-0 flex-1 basis-48"
          onChange={(event) => reset(() => setText(event.target.value))} />
        <select aria-label={COPY.category} className="h-9 min-w-0 max-w-full flex-1 basis-40 rounded-md border bg-background px-2 text-sm" value={category ?? ''}
          onChange={(event) => reset(() => setCategory(event.target.value || null))}>
          <option value="">{COPY.allCategories}</option>
          {options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{COPY.count(Math.min(limit, results.length), results.length)}</span>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
        {results.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{COPY.none}</p> : null}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {results.slice(0, limit).map((template) => (
            <PickerCard key={template.id} template={template} place={placeOf(template)} locale={locale} taken={takenSet.has(template.id)}
              selected={picked.includes(template.id)} onToggle={() => toggle(template.id)} />
          ))}
        </ul>
        {results.length > limit ? (
          <div className="flex justify-center py-3"><Button size="sm" variant="outline" onClick={() => setLimit(limit + PAGE)}>{COPY.more}</Button></div>
        ) : null}
      </div>
    </div>
  )
}
