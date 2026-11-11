'use client'

import { useEffect, useState } from 'react'

const sameOrder = (a: readonly string[], b: readonly string[]) => a.join(',') === b.join(',')

// 首页精选 is arranged first and saved once (Owner 2026-11-12): drags and 移出 change a local
// draft; the saved list (`ids`) changes only on 保存. A draft belongs to the list it was made
// from. While one is unsaved the page locks the other ways of changing the list (the table switch,
// the batch buttons); if the list still changes under it (上下架, a save in another tab), the draft
// is dropped, not replayed on a list the admin did not arrange, and `dropped` says so once.
export function useFeaturedDraft(ids: readonly string[]) {
  const base = ids.join(',')
  const [draft, setDraft] = useState<{ base: string; order: string[] } | null>(null)
  const current = draft?.base === base ? draft.order : null
  const dirty = current !== null && !sameOrder(current, ids)
  const dropped = draft !== null && draft.base !== base && draft.order.join(',') !== draft.base

  // Leaving the page with an unsaved arrangement asks first (the browser's own prompt).
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return {
    shown: current ?? [...ids],
    dirty,
    dropped,
    set: (next: string[]) => setDraft({ base, order: next }),
    reset: () => setDraft(null),
  }
}

export type FeaturedDraft = ReturnType<typeof useFeaturedDraft>
