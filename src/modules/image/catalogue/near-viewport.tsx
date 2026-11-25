'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import { keepFirstScreenCovers } from '@/core/offline'


// Create's grid loads a card's pictures only when the card comes near the screen (after Higgsfield
// and Lovart): the browser's own lazy loading starts far ahead on a slow link (Chrome: about 2500 px),
// so a tap on Create pulled some 30 covers, ~850 KB, before the account's balance arrived (slow 4G,
// 2026-11-24). Only the grid opts in, through this context; other pages keep their own loading.
const DeferCovers = createContext(false)

export function DeferCoversUntilNear({ children }: { children: ReactNode }) {
  return <DeferCovers value>{children}</DeferCovers>
}

export const useDeferCovers = () => useContext(DeferCovers)

// A chosen category's shelves put two rows of cards inside the near-screen margin at once, so a
// phone on slow 4G fetched twelve covers together and the first one (the page's largest paint)
// came 0.8 s later than in the old grid (2026-11-25). While held, covers past the first screen
// wait (shelf-list.tsx releases them); every other view and page leaves this off.
export const HoldCovers = createContext(false)

// About a card and a half ahead: vertical, then horizontal (along a rail).
const NEAR = '400px 400px'

type Style = (element: Element) => { overflowX: string }

// The nearest ancestor that scrolls sideways (a phone category rail, the member picker's row), or
// null. A viewport observer's margin does not reach past such a scroller's clip, so a card inside
// one is watched against the scroller itself (review of #884).
export function scrollingRail(element: Element, style: Style = getComputedStyle): HTMLElement | null {
  const stop = typeof document === 'undefined' ? null : document.body
  for (let node = element.parentElement; node && node !== stop; node = node.parentElement) {
    const x = style(node).overflowX
    if ((x === 'auto' || x === 'scroll') && node.scrollWidth > node.clientWidth) return node
  }
  return null
}

// Calls `onNear` once the element is within `margin` of the screen (`threshold` of it in view).
// Inside a sideways scroller both must hold: the scroller near the screen (vertical margin), and
// the element near the scroller's visible part (horizontal margin). Returns the cleanup.
function watchNear(element: Element, margin: string, threshold: number, onNear: () => void): () => void {
  const rail = scrollingRail(element)
  if (!rail) {
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && onNear(), { rootMargin: margin, threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }
  const [vertical, horizontal = vertical] = margin.split(' ')
  const state = { railNear: false, inRail: false }
  const check = () => state.railNear && state.inRail && onNear()
  const outer = new IntersectionObserver(([entry]) => { state.railNear = entry?.isIntersecting === true; check() }, { rootMargin: `${vertical} 0px` })
  const inner = new IntersectionObserver(([entry]) => { state.inRail = entry?.isIntersecting === true; check() }, { root: rail, rootMargin: `0px ${horizontal}`, threshold })
  outer.observe(rail)
  inner.observe(element)
  return () => {
    outer.disconnect()
    inner.disconnect()
  }
}

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
    return watchNear(element, margin, threshold, () => setNear(true))
  }, [near, margin, threshold])
  return [ref, near]
}

// The covers of one card: eager ones (the first screen) at once; the rest, inside Create's grid,
// once near the screen, at low priority so they never queue ahead of the account's own data. The
// first card's (`priority`) are the page's largest paint on a phone: high priority, so the browser
// fetches them ahead of the other first-screen covers before it has laid the page out.
export function useCardCovers<T extends Element>(eager: boolean, priority = false) {
  const inCreate = useDeferCovers()
  const defer = inCreate && !eager
  const [ref, near] = useNearViewport<T>(!defer)
  const held = useContext(HoldCovers) && !eager
  useKeepFirstScreen(ref, inCreate && eager)
  const fetchPriority = eager ? (priority ? { fetchPriority: 'high' as const } : {}) : { fetchPriority: 'low' as const }
  const img = { loading: eager ? ('eager' as const) : ('lazy' as const), ...fetchPriority }
  return { ref, show: near && !held, img }
}

// Which Create screen the cards are on (All, a category, Saved), for the first-screen covers the
// service worker keeps (core/offline, LCP plan 1); null (search results, other pages): none kept.
const FirstScreen = createContext<string | null>(null)

export function FirstScreenCovers({ screen, children }: { screen: string | null; children: ReactNode }) {
  return <FirstScreen value={screen}>{children}</FirstScreen>
}

// The first-screen cards of one screen report their covers as they load; a second after the last
// one, the whole set goes to the worker in one message, which replaces that screen's earlier set.
const BATCH_MS = 1000
const batches = new Map<string, { urls: Set<string>; timer: ReturnType<typeof setTimeout> | undefined }>()

export function addToScreen(screen: string, urls: readonly string[]) {
  const batch = batches.get(screen) ?? { urls: new Set<string>(), timer: undefined }
  for (const url of urls) batch.urls.add(url)
  clearTimeout(batch.timer)
  batch.timer = setTimeout(() => {
    batches.delete(screen)
    keepFirstScreenCovers(screen, [...batch.urls])
  }, BATCH_MS)
  batches.set(screen, batch)
}

// A first-screen card's covers, once the page has loaded and they have. The URLs are the files the
// browser picked from the srcset, so they are the ones the next launch asks for again.
function useKeepFirstScreen(ref: RefObject<Element | null>, keep: boolean) {
  const screen = useContext(FirstScreen)
  useEffect(() => {
    if (!keep || screen === null) return
    let cancelled = false
    const loaded = (img: HTMLImageElement) =>
      img.complete && img.naturalWidth > 0 ? Promise.resolve(img.currentSrc) : new Promise<string>((resolve) => {
        img.addEventListener('load', () => resolve(img.currentSrc), { once: true })
        img.addEventListener('error', () => resolve(''), { once: true })
      })
    const post = async () => {
      const urls = await Promise.all([...(ref.current?.querySelectorAll('img') ?? [])].map(loaded))
      if (!cancelled) addToScreen(screen, urls.filter(Boolean))
    }
    const start = () => void post()
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => {
      cancelled = true
      window.removeEventListener('load', start)
    }
  }, [ref, keep, screen])
}
