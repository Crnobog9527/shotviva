'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import type { SpaceViewerLabels } from '../page-content'
import { HOTEL_CASE_ATTR } from './hotel-cases-dom'

// The viewer's code (Radix dialog, the full-size pictures) is not in the home page's first load:
// it is fetched on the first press of a case, and only then rendered.
const HotelCaseViewer = dynamic(() => import('./hotel-case-viewer').then((module) => module.HotelCaseViewer), { ssr: false })

type Props = { labels: { before: string; after: string }; viewer: SpaceViewerLabels }

// One listener on the hotels section for its four case buttons (no per-case client component).
export function HotelCasesMount({ labels, viewer }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const [wanted, setWanted] = useState(false)
  useEffect(() => {
    const section = document.getElementById('hotels')
    if (!section) return
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest(`[${HOTEL_CASE_ATTR}]`)
      if (!button || !section.contains(button)) return
      setWanted(true)
      setOpen(Number(button.getAttribute(HOTEL_CASE_ATTR)))
    }
    section.addEventListener('click', onClick)
    return () => section.removeEventListener('click', onClick)
  }, [])
  return wanted ? <HotelCaseViewer index={open} onIndex={setOpen} labels={labels} viewer={viewer} /> : null
}
