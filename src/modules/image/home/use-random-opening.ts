'use client'

import { useEffect, type RefObject } from 'react'

import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

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
  card: RefObject<HTMLElement | null>
  locale: Locale
  currentId: string | null
  // Still as the page drew it: nothing picked, no photo, no draft brought back.
  untouched(): boolean
  show(template: CatalogueTemplate): void
}

// After hydration: the bundle members (/api/home/opening, shared by the CDN), one picked at random,
// its result decoded first, then shown in the card if the visitor has not touched it meanwhile.
// The card keeps its frame and crossfades (panel-stage.tsx), so nothing moves on the page.
export function useRandomOpening({ enabled, card, locale, currentId, untouched, show }: Args) {
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    // Touching the card cancels the swap wherever it is: fetching, deciding or decoding.
    const stopWatching = card.current ? watchCardTouches(card.current, () => controller.abort()) : () => undefined
    const stillUntouched = () => !controller.signal.aborted && untouched()
    void import('./random-opening')
      .then(({ runRandomOpening }) => runRandomOpening({ locale, currentId, untouched: stillUntouched, show, signal: controller.signal }))
      .catch(() => undefined)
      .finally(stopWatching)
    return () => {
      stopWatching()
      controller.abort()
    }
    // Once per page view: later changes of the template are the visitor's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, locale])
}
