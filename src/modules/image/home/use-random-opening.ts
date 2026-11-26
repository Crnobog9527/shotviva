'use client'

import { useEffect } from 'react'

import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { naturalSize } from '../workspace/photo-ratio'
import { stageImage } from './use-stage-cover'

// A random 精选组合 member for the first-screen card (Owner 2026-11-26): one with both covers, the
// one on show included (then nothing changes). `random` is Math.random in the browser.
export function randomOpening(pool: readonly CatalogueTemplate[], random: () => number): CatalogueTemplate | null {
  const usable = pool.filter((template) => template.cover.before && template.cover.after)
  if (usable.length === 0) return null
  return usable[Math.min(usable.length - 1, Math.floor(random() * usable.length))] ?? null
}

async function fetchPool(locale: Locale, signal: AbortSignal): Promise<CatalogueTemplate[]> {
  const response = await fetch(`/api/home/opening?locale=${locale}`, { credentials: 'omit', signal })
  if (!response.ok) return []
  const body = (await response.json()) as { templates?: CatalogueTemplate[] }
  return Array.isArray(body.templates) ? body.templates : []
}

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
    void fetchPool(locale, controller.signal).then(async (pool) => {
      const pick = randomOpening(pool, Math.random)
      if (!pick || pick.id === currentId || !untouched()) return
      await naturalSize(stageImage(pick.cover.after as string).src)
      if (!controller.signal.aborted && untouched()) show(pick)
    }).catch(() => undefined)
    return () => controller.abort()
    // Once per page view: later changes of the template are the visitor's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, locale])
}
