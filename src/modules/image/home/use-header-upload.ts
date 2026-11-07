'use client'

import { useEffect } from 'react'

// What the header's primary stands in for while the generator is scrolled away: 'upload' (no
// photo yet: open the file picker) or 'generate' (a photo is in: go back to finish); null while
// the generator is on screen, when the button is plain Start free again.
export type HeaderCta = 'upload' | 'generate' | null

// The header's Start free is server HTML in core/content and cannot import this module, so it
// carries `data-generator-upload` (like the template cards' data attributes, use-pick-events).
// While `mode` is set, <html> gets `data-gen-away="<mode>"`: from 768px up the button shows the
// matching label (marketing.css), and a click runs `onClick` instead of going to /signup. Phones
// never show that button; their dock does this job. Capture phase, so the link's own navigation
// never starts.
export function useHeaderUpload(mode: HeaderCta, onClick: (mode: 'upload' | 'generate') => void) {
  useEffect(() => {
    if (!mode) return
    const root = document.documentElement
    root.setAttribute('data-gen-away', mode)
    const listener = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-generator-upload]') : null
      if (!target) return
      event.preventDefault()
      event.stopPropagation()
      onClick(mode)
    }
    document.addEventListener('click', listener, true)
    return () => {
      document.removeEventListener('click', listener, true)
      root.removeAttribute('data-gen-away')
    }
  }, [mode, onClick])
}
