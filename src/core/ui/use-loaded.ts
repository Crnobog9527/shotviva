'use client'

import { useCallback, useState } from 'react'

// Whether an <img> has finished loading, for painting a ground behind its own pixels only then:
// a white box flashing on the dark UI while a photo loads would read as a broken image (T31).
// The ref catches an image that loaded before hydration, when onLoad never fires.
export function useLoaded() {
  const [loaded, setLoaded] = useState(false)
  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])
  return { loaded, ref, onLoad: () => setLoaded(true) }
}
