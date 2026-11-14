'use client'

import { useCallback, useEffect, useRef } from 'react'

// The mark on the history entry an open viewer pushed. It lives in history.state, so a second
// mount (React's dev double effect) sees it and does not push twice. The Next router keeps a
// pushState's own keys next to its internal ones (as photos/viewer/viewer-context.tsx relies on).
const ENTRY = 'sampleViewer'
const onPushedEntry = () => (window.history.state as Record<string, unknown> | null)?.[ENTRY] === true

// While mounted, the phone's back gesture (or the browser's Back) closes the viewer instead of
// leaving the page under it. Closing from inside (✕, Esc, the scrim) steps back over the pushed
// entry, so the history ends as it was; the popstate that follows does the closing.
export function useBackToClose(close: () => void): () => void {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  }, [close])
  useEffect(() => {
    if (!onPushedEntry()) window.history.pushState({ [ENTRY]: true }, '', window.location.href)
    const onPop = () => {
      if (!onPushedEntry()) closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return useCallback(() => {
    if (onPushedEntry()) window.history.back()
    else closeRef.current()
  }, [])
}
