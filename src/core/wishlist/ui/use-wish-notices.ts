'use client'

import { useEffect, useRef, useState } from 'react'

import { afterDismiss, type NoticeItem } from '../notice-items'

export type MarkNoticesSeen = (requestIds: string[]) => Promise<void>

// The banner's step-through (ARCHITECTURE §15.4): newest first, each notice marked seen as it
// comes up, so one that was shown never comes back. A failed mark only means it shows once
// more on another visit, so it is ignored.
export function useWishNotices(items: readonly NoticeItem[], markSeen: MarkNoticesSeen) {
  // The list as it was when the banner came up. A later render brings a shorter list once the
  // server has the shown ones as seen, and must not swap or drop the notice on screen.
  const [shown] = useState(items)
  const [index, setIndex] = useState<number | null>(shown.length ? 0 : null)
  const marked = useRef(new Set<string>())
  const current = index === null ? null : (shown[index] ?? null)

  useEffect(() => {
    if (!current || marked.current.has(current.requestId)) return
    marked.current.add(current.requestId)
    markSeen([current.requestId]).catch(() => {})
  }, [current, markSeen])

  return {
    current,
    remaining: index === null ? 0 : shown.length - index - 1,
    dismiss: () => setIndex((at) => afterDismiss(at, shown.length)),
    close: () => setIndex(null),
  }
}
