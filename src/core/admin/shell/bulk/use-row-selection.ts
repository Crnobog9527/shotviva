'use client'

import { useCallback, useMemo, useState } from 'react'

export type RowSelection = {
  ids: string[]
  has(id: string): boolean
  toggle(id: string): void
  toggleAll(): void
  clear(): void
  // Keeps only these ids ticked: after a batch, the skipped rows stay picked so they can be retried.
  keepOnly(ids: readonly string[]): void
  all: boolean
  some: boolean
}

// The rows ticked on the current page of an admin list. Only ids still on the page count, so a
// filter change, a page change, or a row leaving the filter after a batch quietly drops it.
export function useRowSelection(pageIds: readonly string[]): RowSelection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const ids = useMemo(() => pageIds.filter((id) => picked.has(id)), [pageIds, picked])
  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const all = pageIds.length > 0 && ids.length === pageIds.length
  const toggleAll = useCallback(() => setPicked(all ? new Set() : new Set(pageIds)), [all, pageIds])
  const clear = useCallback(() => setPicked(new Set()), [])
  const keepOnly = useCallback((keep: readonly string[]) => setPicked(new Set(keep)), [])
  return { ids, has: (id) => picked.has(id) && pageIds.includes(id), toggle, toggleAll, clear, keepOnly, all, some: ids.length > 0 && !all }
}
