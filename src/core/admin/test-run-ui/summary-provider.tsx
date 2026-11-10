'use client'

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { loadSummary } from './api'

// The budget and recent photos are shared by every template. Warm them once while
// the admin chooses a template. Subsequent edits and mutations fetch fresh data.
const SummaryContext = createContext(loadSummary)

export const useOpeningSummary = () => useContext(SummaryContext)

type Summary = Awaited<ReturnType<typeof loadSummary>>
export function TestPanelSummaryProvider({ children, initial }: { children: ReactNode; initial?: Promise<Summary | null> }) {
  const warm = useRef<{ value: ReturnType<typeof loadSummary>; started: number } | null>(null)
  useEffect(() => {
    let mounted = true
    const value = initial ? Promise.resolve(initial).then(summary => summary ?? loadSummary()) : loadSummary()
    warm.current = { value, started: Date.now() }
    void value.then(({ recentPhotos }) => {
      if (mounted) for (const photo of recentPhotos) {
        const image = new Image()
        image.fetchPriority = 'low'
        image.src = photo.url
      }
    }).catch(() => { if (mounted) warm.current = null })
    return () => { mounted = false; warm.current = null }
  }, [initial])
  const read = useCallback(() => {
    const cached = warm.current
    warm.current = null
    return cached && Date.now() - cached.started < 30_000 ? cached.value.catch(() => loadSummary()) : loadSummary()
  }, [])
  return <SummaryContext.Provider value={read}>{children}</SummaryContext.Provider>
}
