'use client'

import { useEffect } from 'react'

import type { PhotoItem } from '../photo-item'
import { useViewer } from './viewer-context'

// The grid hands the viewer its finished works in display order: what a card's click shows at
// once (photo, name, settings), and the order ← / → and a swipe step through.
export function WorksIndex({ items }: { items: PhotoItem[] }) {
  const setItems = useViewer()?.setItems
  useEffect(() => {
    setItems?.(items)
  }, [setItems, items])
  return null
}
