'use client'

import { useEffect } from 'react'

// Marks <html> while a sheet that should push the page back is open (the paywall, comps-v3-b
// paywall.html); globals.css scales and dims the app page behind it ([data-app-ground]).
export function usePushBack(open: boolean) {
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    root.dataset.pushedBack = ''
    return () => {
      delete root.dataset.pushedBack
    }
  }, [open])
}
