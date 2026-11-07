'use client'

import { useCallback, useMemo, useState } from 'react'

export type Selection = {
  ids: string[]
  has(id: string): boolean
  toggle(id: string): void
  toggleAll(): void
  clear(): void
  all: boolean
  some: boolean
}

// The users ticked on the current page. Only ids still on the page count, so a filter or a page
// change quietly drops the rest; a batch is never bigger than one page (50).
export function useSelection(pageIds: readonly string[]): Selection {
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
  return { ids, has: (id) => picked.has(id) && pageIds.includes(id), toggle, toggleAll, clear, all, some: ids.length > 0 && !all }
}
