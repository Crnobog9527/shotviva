'use client'

import { useEffect } from 'react'

// The home template cards are server HTML in core/content (建站规格 R5) and cannot import this
// module, so they carry data attributes instead: `data-pick-template` picks the template into
// the generator, `data-preview-template` opens the picker on it (DESIGN §6.9 item 2).
export function usePickEvents(onPick: (id: string) => void, onPreview: (id: string) => void) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('[data-pick-template], [data-preview-template]') : null
      if (!target) return
      const pick = target.getAttribute('data-pick-template')
      const preview = target.getAttribute('data-preview-template')
      if (pick) onPick(pick)
      else if (preview) onPreview(preview)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [onPick, onPreview])
}
