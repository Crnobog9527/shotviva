'use client'

import { useMemo, useState } from 'react'

import { ALL, filterCatalogue, type Selection } from '../catalogue/catalogue-filter'
import { buildSearchIndex, searchTemplates } from '../catalogue/catalogue-search'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { seriesOf, type CatalogueView } from '../catalogue/catalogue-view'
import { groupEntries } from '../catalogue/picker-browse'

// Where the picker's list is: a search (it overrides the chips), an open series, or a chip
// (All, Saved, or a category up to three levels down). Each opening of the picker starts on All.
export function usePickerBrowse(view: CatalogueView, saved: readonly CatalogueTemplate[]) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Selection>(ALL)
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const index = useMemo(() => buildSearchIndex(view.entries, view.filters), [view])
  const results = useMemo(() => (query.trim() ? searchTemplates(index, query) : null), [index, query])
  const { active, shown } = filterCatalogue(view.entries, saved, chosen)
  const groups = active.saved ? [{ key: '~saved', name: null, entries: shown }] : groupEntries(shown, view.filters, active.path)
  const series = seriesId ? (seriesOf(view.entries).find((item) => item.id === seriesId) ?? null) : null
  return {
    query,
    search: (next: string) => {
      setQuery(next)
      setSeriesId(null)
    },
    selection: active,
    select: (next: Selection) => {
      setChosen(next)
      setSeriesId(null)
    },
    results,
    groups,
    series,
    openSeries: setSeriesId,
  }
}

export type PickerBrowseState = ReturnType<typeof usePickerBrowse>
