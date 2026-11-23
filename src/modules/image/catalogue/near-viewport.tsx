'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

// Create's grid loads a card's pictures only when the card comes near the screen (after Higgsfield
// and Lovart): the browser's own lazy loading starts far ahead on a slow link (Chrome: about 2500 px),
// so a tap on Create pulled some 30 covers, ~850 KB, before the account's balance arrived (slow 4G,
// 2026-11-24). Only the grid opts in, through this context; other pages keep their own loading.
const DeferCovers = createContext(false)

export function DeferCoversUntilNear({ children }: { children: ReactNode }) {
  return <DeferCovers value>{children}</DeferCovers>
}

export const useDeferCovers = () => useContext(DeferCovers)

// About a card and a half ahead, down a column or along a rail.
const NEAR = '400px 400px'

// True once the element has come within `margin` of the screen (`threshold` of it in view), or
// at once when `immediate`; it stays true. Without IntersectionObserver it turns true right away.
export function useNearViewport<T extends Element>(immediate: boolean, margin = NEAR, threshold = 0): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(immediate)
  useEffect(() => {
    if (near) return
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setNear(true))
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setNear(true)
    }, { rootMargin: margin, threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [near, margin, threshold])
  return [ref, near]
}

// The covers of one card: eager ones (the first screen) at once; the rest, inside Create's grid,
// once near the screen, at low priority so they never queue ahead of the account's own data.
export function useCardCovers<T extends Element>(eager: boolean) {
  const defer = useDeferCovers() && !eager
  const [ref, near] = useNearViewport<T>(!defer)
  const img = { loading: eager ? ('eager' as const) : ('lazy' as const), ...(eager ? {} : { fetchPriority: 'low' as const }) }
  return { ref, show: near, img }
}
