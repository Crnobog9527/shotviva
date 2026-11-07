import type { CatalogueTemplate } from './catalogue-template'

// Chip sentinels: "no filter" and the account's saved templates (T83). Neither can be a
// category key, which is always a slug.
export const ALL = ''
export const SAVED = '~saved'

// What the grid shows for the chosen chip. Saved lists the saved templates newest first; with
// none left (the last one was just removed) the chip is gone, so the grid falls back to All.
export function filterCatalogue(templates: readonly CatalogueTemplate[], saved: readonly CatalogueTemplate[], chosen: string) {
  const active = chosen === SAVED && saved.length === 0 ? ALL : chosen
  if (active === ALL) return { active, shown: templates }
  if (active === SAVED) return { active, shown: saved }
  return { active, shown: templates.filter((template) => template.category === active) }
}
