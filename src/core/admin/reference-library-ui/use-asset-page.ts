import { useCallback, useEffect, useRef, useState } from 'react'
import { listAssets } from './api'
import type { AssetFilter, AssetPage } from './types'

export function useAssetPage(filter: AssetFilter, initial?: AssetPage) {
  const [page, setPage] = useState<AssetPage>(initial ?? { items: [], nextCursor: null })
  const [loading, setLoading] = useState(!initial)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  const sentinel = useRef<HTMLButtonElement>(null)
  const load = useCallback(async (cursor: string | null) => {
    if (request.current) return
    const abort = new AbortController()
    request.current = abort
    setLoading(true)
    setFailed(false)
    try {
      const next = await listAssets(filter, cursor, abort.signal)
      if (abort.signal.aborted) return
      setPage(prev => {
        if (!cursor) return next
        const seen = new Set(prev.items.map(asset => asset.id))
        return { items: [...prev.items, ...next.items.filter(asset => !seen.has(asset.id))], nextCursor: next.nextCursor }
      })
    } catch {
      if (!abort.signal.aborted) setFailed(true)
    } finally {
      if (request.current === abort) { request.current = null; setLoading(false) }
    }
  }, [filter])
  useEffect(() => {
    let mounted = true
    if (!initial) queueMicrotask(() => { if (mounted) void load(null) })
    return () => { mounted = false; request.current?.abort(); request.current = null }
  }, [initial, load])
  useEffect(() => {
    const cursor = page.nextCursor
    if (!cursor || !sentinel.current || loading || failed || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load(cursor)
    }, { rootMargin: '200px' })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [page.nextCursor, loading, failed, load])
  return { page, loading, failed, sentinel, load }
}
