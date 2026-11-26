'use client'

import { useEffect } from 'react'

import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'

type Args = {
  // The page renders the first bundle member and asks for the swap (home-opening.ts).
  enabled: boolean
  locale: Locale
  currentId: string | null
  // Still as the page drew it: nothing picked, no photo, no draft brought back.
  untouched(): boolean
  show(template: CatalogueTemplate): void
}

// After hydration: the bundle members (/api/home/opening, shared by the CDN), one picked at random,
// its result decoded first, then shown in the card if the visitor has not touched it meanwhile.
// The card keeps its frame and crossfades (panel-stage.tsx), so nothing moves on the page.
export function useRandomOpening({ enabled, locale, currentId, untouched, show }: Args) {
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    void import('./random-opening')
      .then(({ runRandomOpening }) => runRandomOpening({ locale, currentId, untouched, show, signal: controller.signal }))
      .catch(() => undefined)
    return () => controller.abort()
    // Once per page view: later changes of the template are the visitor's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, locale])
}
