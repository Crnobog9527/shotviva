'use client'

import { useEffect } from 'react'

// While a draft is unsaved, leaving asks first: the browser's own prompt on reload or close, and a
// confirm on in-app links (client navigation never fires beforeunload). A link that opens a new
// tab leaves the draft in place, so it is let through.
export function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!link || link.getAttribute('target') === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey) return
      if (window.confirm(message)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, message])
}
