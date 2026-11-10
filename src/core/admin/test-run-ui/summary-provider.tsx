'use client'

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import type { TestPhotoView } from '../test-runs'
import { loadSummary } from './api'
import { preloadPhoto } from './thumbnail-fallback'

// The budget and recent photos are shared by every template. Warm them once while
// the admin chooses a template. Subsequent edits and mutations fetch fresh data.
const SummaryContext = createContext(loadSummary)

export const useOpeningSummary = () => useContext(SummaryContext)

type Summary = Awaited<ReturnType<typeof loadSummary>>
export function TestPanelSummaryProvider({ children, initial, previews }: {
  children: ReactNode
  initial?: Promise<Summary | null>
  previews?: Promise<TestPhotoView[] | null>
}) {
  const warm = useRef<{ value: ReturnType<typeof loadSummary>; started: number } | null>(null)
  useEffect(() => {
    let mounted = true
    const value = initial ? Promise.resolve(initial).then(summary => summary ?? loadSummary()) : loadSummary()
    warm.current = { value, started: Date.now() }
    const photos = previews ? Promise.resolve(previews).then(photos => photos ?? value.then(s => s.recentPhotos)) : value.then(s => s.recentPhotos)
    void photos.then(photos => { if (mounted) photos.forEach(preloadPhoto) }).catch(() => { if (mounted) warm.current = null })
    return () => { mounted = false; warm.current = null }
  }, [initial, previews])
  const read = useCallback(() => {
    const cached = warm.current
    warm.current = null
    return cached && Date.now() - cached.started < 30_000 ? cached.value.catch(() => loadSummary()) : loadSummary()
  }, [])
  return <SummaryContext.Provider value={read}>{children}</SummaryContext.Provider>
}
