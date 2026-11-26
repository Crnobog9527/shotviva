import type { Locale } from '@/core/i18n'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { naturalSize } from '../workspace/photo-ratio'
import { touchedEarly } from './early-touch'
import { stageImage } from './use-stage-cover'

// The random opening's own code (use-random-opening.ts), loaded after the page has hydrated so the
// home page's first load does not carry it (scripts/js-budget).

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


// Fetches the members, picks one, decodes its result and shows it while the card is untouched.
export async function runRandomOpening({ locale, currentId, untouched: card, show, signal }: { locale: Locale; currentId: string | null; untouched(): boolean; show(template: CatalogueTemplate): void; signal: AbortSignal }) {
  // A touch before hydration (early-touch.ts) counts as much as one after it.
  const untouched = () => !touchedEarly() && card()
  if (!untouched()) return
  const pick = randomOpening(await fetchPool(locale, signal), Math.random)
  if (!pick || pick.id === currentId || !untouched()) return
  await naturalSize(stageImage(pick.cover.after as string).src)
  if (!signal.aborted && untouched()) show(pick)
}
