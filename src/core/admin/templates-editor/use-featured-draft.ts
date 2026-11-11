'use client'

import { useEffect, useState } from 'react'

// 首页精选 is arranged first and saved once (Owner 2026-11-12): drags and 移出 change a local
// draft; the saved list (`ids`) changes only on 保存. A draft belongs to the list it was made
// from: when the saved list changes (this save landed, or a switch elsewhere on the page), it is
// dropped rather than replayed on top of a list the admin did not arrange.
export function useFeaturedDraft(ids: readonly string[]) {
  const base = ids.join(',')
  const [draft, setDraft] = useState<{ base: string; order: string[] } | null>(null)
  const order = draft?.base === base ? draft.order : null
  const dirty = order !== null && order.join(',') !== base

  // Leaving the page with an unsaved arrangement asks first (the browser's own prompt).
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return {
    shown: order ?? [...ids],
    dirty,
    set: (next: string[]) => setDraft({ base, order: next }),
    reset: () => setDraft(null),
  }
}
