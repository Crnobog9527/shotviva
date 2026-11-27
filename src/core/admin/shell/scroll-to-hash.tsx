'use client'

import { useEffect } from 'react'

// Scrolls to its section when the address names it (侧栏「首页展示」 → /admin/templates#home-display).
// The section streams in after the page, so the browser's own jump to the fragment finds nothing.
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [id])
  return null
}
