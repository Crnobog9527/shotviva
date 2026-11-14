'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { POSTER_PARAM, readSelection, selectionSearch, SERIES_PARAM, type Selection } from './catalogue-filter'
import type { FilterNode } from './catalogue-view'

// Create's filter and open series, read from and written to the address (T102), so a filtered
// view or an open series can be shared and survives a refresh. Writes replace the entry rather
// than push one: a chip tap is not a page, and Back leaves Create as before. Next keeps
// useSearchParams in step with history.replaceState (docs: Linking and Navigating, Native
// History API), so nothing is fetched.
export function useCatalogueQuery(filters: readonly FilterNode[]) {
  const search = useSearchParams()
  const selection = useMemo(() => readSelection(new URLSearchParams(search.toString()), filters), [search, filters])
  const seriesKey = search.get(SERIES_PARAM)
  // An open poster editor (?poster=<id>): a poster card, or an old /posters/<id> link.
  const posterId = search.get(POSTER_PARAM)
  const write = useCallback((next: Selection, series: string | null, poster: string | null = null) => {
    const query = selectionSearch(new URLSearchParams(window.location.search), next, series, poster)
    window.history.replaceState(null, '', `${window.location.pathname}${query}${window.location.hash}`)
  }, [])
  return {
    selection,
    seriesKey,
    select: (next: Selection) => write(next, null),
    openSeries: (key: string) => write(selection, key),
    closeSeries: () => write(selection, null),
    posterId,
    openPoster: (id: string) => write(selection, null, id),
    closePoster: () => write(selection, null),
  }
}
