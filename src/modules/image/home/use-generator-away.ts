'use client'

import { useEffect, useState, type RefObject } from 'react'

export type GeneratorAway = {
  // No generator on screen (the card or the bench, whichever this width shows).
  away: boolean
  // ...and the visitor has scrolled past it (it is above the viewport, not still below the fold).
  past: boolean
  // The page footer is on screen: the phone dock steps aside for it.
  footer: boolean
}

// Where the first-screen generator is relative to the viewport, for the two things that stand
// in for it while it is scrolled away: the phone dock (`away`) and the header's "Upload photo"
// (`past`: at the top of a short window the generator can sit below the fold, and the header
// keeps Start free there).
export function useGeneratorAway(watch: readonly RefObject<HTMLElement | null>[]): GeneratorAway {
  const [state, setState] = useState<GeneratorAway>({ away: false, past: false, footer: false })
  useEffect(() => {
    const footer = document.querySelector('footer')
    const seen = new Map<Element, { visible: boolean; above: boolean }>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) seen.set(entry.target, { visible: entry.isIntersecting, above: entry.boundingClientRect.bottom <= 0 })
      const shown = watch.map((ref) => ref.current).filter((element): element is HTMLElement => element !== null && element.offsetParent !== null)
      const away = !shown.some((element) => seen.get(element)?.visible)
      const next = { away, past: away && shown.some((element) => seen.get(element)?.above), footer: Boolean(footer && seen.get(footer)?.visible) }
      setState((prev) => (prev.away === next.away && prev.past === next.past && prev.footer === next.footer ? prev : next))
    })
    for (const ref of watch) if (ref.current) observer.observe(ref.current)
    if (footer) observer.observe(footer)
    return () => observer.disconnect()
  }, [watch])
  return state
}
