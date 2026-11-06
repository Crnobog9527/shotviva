'use client'

import { useEffect } from 'react'

// Content-addressed stylesheet copied verbatim from Graylum staging (public/fonts/misans/,
// ARCHITECTURE §17). A new font build means a new hash here, never new bytes at this URL.
export const MISANS_STYLESHEET = '/fonts/misans/misans-4bf5d8a22f58eaab.css'
const LINK_ID = 'misans-font'

// Keeps the font CSS out of the critical path: two frames after hydration the stylesheet is
// attached, and unicode-range lets the browser fetch only the subsets the page's text needs
// (an English page needs none of the CJK ones). No preload, no external host.
export function MiSansFont() {
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (document.getElementById(LINK_ID)) return
        const link = document.createElement('link')
        link.id = LINK_ID
        link.rel = 'stylesheet'
        link.href = MISANS_STYLESHEET
        document.head.appendChild(link)
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  return null
}
