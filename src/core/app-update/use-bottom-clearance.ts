'use client'

import { useEffect, useState } from 'react'

// Fixed things at the bottom of the screen the banner must sit above (T90): a flow page's action
// bar, the phone tab bar, the home page's floating upload button, the cookie bar. Measured, not
// hard-coded: their height changes with a notice line, the home-indicator inset, the language.
const OBSTACLES = '[data-action-bar], nav[data-tabbar], .mk-dock, [data-consent-bar]'
// The dock slides in and out as the page scrolls; the banner follows within this long.
const REMEASURE_MS = 400

function isBottomFixed(element: HTMLElement, viewport: number): number | null {
  const style = window.getComputedStyle(element)
  if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') return null
  const rect = element.getBoundingClientRect()
  // Off screen (the dock tucked away) or in the top half (a bar moved up, the desktop tab bar).
  if (rect.height === 0 || rect.top >= viewport || rect.top < viewport / 2) return null
  return rect.top
}

// Pixels covered at the bottom of the viewport by those obstacles; 0 when none is there.
export function measureClearance(): number {
  const viewport = window.innerHeight
  let top = viewport
  for (const element of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
    const at = isBottomFixed(element, viewport)
    if (at !== null) top = Math.min(top, at)
  }
  return Math.max(0, Math.round(viewport - top))
}

export function useBottomClearance(): number {
  const [clearance, setClearance] = useState(0)
  useEffect(() => {
    const measure = () => setClearance(measureClearance())
    measure()
    const timer = window.setInterval(measure, REMEASURE_MS)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
    }
  }, [])
  return clearance
}
