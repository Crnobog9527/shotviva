'use client'

import { useEffect, useRef } from 'react'

import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { takeEarlyTouch } from './early-touch'

// Anything the visitor does inside the card: focusing or typing in the note, changing size or
// quality, pointing, scrolling or pressing the rail. The first one counts as touching it (#934 review).
const TOUCH_EVENTS = ['focusin', 'input', 'change', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

// Calls `onTouch` once, on the first such event inside `target` (captured, so the rail's own
// scroll counts); returns the way to stop listening.
const CAPTURE: AddEventListenerOptions = { capture: true, passive: true }

export function watchCardTouches(target: EventTarget, onTouch: () => void): () => void {
  const handle = () => {
    stop()
    onTouch()
  }
  const stop = () => {
    for (const type of TOUCH_EVENTS) target.removeEventListener(type, handle, CAPTURE)
  }
  for (const type of TOUCH_EVENTS) target.addEventListener(type, handle, CAPTURE)
  return stop
}

type Args = {
  // The page renders the first bundle member and asks for the swap (home-opening.ts).
  enabled: boolean
  // The card: any interaction inside it cancels a swap still on its way.
  card: { current: EventTarget | null }
  locale: Locale
  currentId: string | null
  // Still as the page drew it: nothing picked, no photo, no draft brought back.
  untouched(): boolean
  show(template: CatalogueTemplate): void
}

type Run = typeof import('./random-opening')['runRandomOpening']
const loadRun = (): Promise<Run> => import('./random-opening').then((m) => m.runRandomOpening)

// One mount's random opening; returns its cleanup. A touch before hydration (early-touch.ts), taken
// once by this mount, stops it before anything is fetched; after hydration touching the card
// cancels it wherever it is: fetching, deciding or decoding.
// `early`: what this mount took from takeEarlyTouch() (kept by the hook, so a remount of the same
// mount, as React's StrictMode does in development, sees the same answer).
export function beginOpening({ enabled, card, locale, currentId, untouched, show }: Args, early: boolean, load: () => Promise<Run> = loadRun): () => void {
  if (!enabled || early) return () => undefined
  const controller = new AbortController()
  const stopWatching = card.current ? watchCardTouches(card.current, () => controller.abort()) : () => undefined
  const stillUntouched = () => !controller.signal.aborted && untouched()
  void load()
    .then((run) => run({ locale, currentId, untouched: stillUntouched, show, signal: controller.signal }))
    .catch(() => undefined)
    .finally(stopWatching)
  return () => {
    stopWatching()
    controller.abort()
  }
}

// After hydration: the bundle members (/api/home/opening, shared by the CDN), one picked at random,
// its result decoded first, then shown in the card if the visitor has not touched it meanwhile.
// The card keeps its frame and crossfades (panel-stage.tsx), so nothing moves on the page.
export function useRandomOpening(args: Args) {
  const { enabled, locale } = args
  const early = useRef<boolean | null>(null)
  useEffect(() => {
    // Only a mount that may swap takes the flag (the signed-out stand-in shown while the session
    // streams in leaves it, and the listener, to the generator that replaces it).
    if (enabled) early.current ??= takeEarlyTouch()
    return beginOpening(args, early.current === true)
  },
    // Once per mount: later changes of the template are the visitor's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, locale])
}
