'use client'

import { useCallback, useState, useTransition } from 'react'

import type { Page } from '../types'

export type LoadPage<T> = (cursor: string) => Promise<Page<T>>

// A keyset list that grows by "Show more" (AGENTS §5.1: 30 a page). The server renders the
// first page; later pages come from a server action with the previous page's cursor.
export function usePaged<T extends { id: string }>(first: Page<T>, load: LoadPage<T>) {
  const [items, setItems] = useState(first.items)
  const [cursor, setCursor] = useState(first.nextCursor)
  const [failed, setFailed] = useState(false)
  const [loading, startTransition] = useTransition()

  const more = useCallback(() => {
    if (!cursor) return
    setFailed(false)
    startTransition(async () => {
      try {
        const page = await load(cursor)
        setItems((current) => [...current, ...page.items.filter((item) => !current.some((seen) => seen.id === item.id))])
        setCursor(page.nextCursor)
      } catch {
        setFailed(true)
      }
    })
  }, [cursor, load])

  return { items, hasMore: cursor !== null, loading, failed, more }
}
