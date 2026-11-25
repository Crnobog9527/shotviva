'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

import { HOTEL_OPEN_ATTR, wakeThumbs } from './hotel-cases-dom'

// The viewer's code, labels and styles (Radix dialog, the full-size pictures) are not in the home
// page's first load: they are fetched on the first press of a case, and only then rendered.
const HotelCaseViewer = dynamic(() => import('./hotel-case-viewer').then((module) => module.HotelCaseViewer), { ssr: false })

// One listener on the hotels section for its case buttons and "See all 4" (no per-case client
// component, no props: everything the viewer shows is in the page or asked for on open).
export function HotelCasesMount() {
  const [open, setOpen] = useState<number | null>(null)
  const [wanted, setWanted] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const section = document.getElementById('hotels')
    if (!section) return
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLElement>(`[${HOTEL_OPEN_ATTR}]`)
      if (!button || !section.contains(button)) return
      opener.current = button
      wakeThumbs(section)
      setWanted(true)
      setOpen(Number(button.getAttribute(HOTEL_OPEN_ATTR)))
    }
    section.addEventListener('click', onClick)
    return () => section.removeEventListener('click', onClick)
  }, [])
  return wanted ? <HotelCaseViewer index={open} onIndex={setOpen} opener={opener} /> : null
}
