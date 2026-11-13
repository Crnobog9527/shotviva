import type { CatalogueTemplate } from './catalogue-template'
import { pathStartsWith, type FilterNode, type GridEntry } from './catalogue-view'

// Create's filter lives in the address so a filtered view can be shared (T102):
// ?category=<root slug>[/<child slug>[/<grandchild slug>]], ?saved=1 for the account's saved
// templates (T83), and ?series=<slug or id> while a series sheet is open. No parameter is All.
export const CATEGORY_PARAM = 'category'
export const SAVED_PARAM = 'saved'
export const SERIES_PARAM = 'series'
// A poster template's editor, open as a dialog over Create (ARCHITECTURE §5.3).
export const POSTER_PARAM = 'poster'

// Where sign-in comes back to for Create (requireUser): the series a link opened (the public
// series cards link to /generate?series=<slug>), or the poster editor (old /posters/<id> links
// land on /generate?poster=<id>), survives the trip; anything else is plain /generate. Only a
// slug or id shape is kept, so nothing but that one parameter rides along (sanitizeNext still
// keeps `next` on this site).
const SERIES_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const isOpenKey = (value: unknown): value is string => typeof value === 'string' && value.length <= 80 && SERIES_KEY.test(value)
export function createReturnPath(series: string | string[] | undefined, poster?: string | string[]): string {
  if (isOpenKey(series)) return `/generate?${SERIES_PARAM}=${series}`
  return isOpenKey(poster) ? `/generate?${POSTER_PARAM}=${poster}` : '/generate'
}

export type Selection = { saved: boolean; path: string[] }
export const ALL: Selection = { saved: false, path: [] }

// The deepest prefix of the asked path that exists in the chip tree, matched level by level
// (two parents can reuse a slug). An unknown or hand-edited path shows its known part, or All.
export function resolvePath(filters: readonly FilterNode[], asked: readonly string[]): string[] {
  const path: string[] = []
  let level = filters
  for (const slug of asked.slice(0, 3)) {
    const node = level.find((item) => item.slug === slug)
    if (!node) break
    path.push(node.slug)
    level = node.children
  }
  return path
}

export function readSelection(search: URLSearchParams, filters: readonly FilterNode[]): Selection {
  if (search.get(SAVED_PARAM) === '1') return { saved: true, path: [] }
  const asked = (search.get(CATEGORY_PARAM) ?? '').split('/').filter(Boolean)
  return { saved: false, path: resolvePath(filters, asked) }
}

// The query for a selection (and an open series), keeping every other parameter. Slugs are
// plain [a-z0-9-], so the slashes are left readable.
export function selectionSearch(current: URLSearchParams, selection: Selection, series: string | null = current.get(SERIES_PARAM), poster: string | null = null): string {
  const next = new URLSearchParams(current)
  for (const key of [CATEGORY_PARAM, SAVED_PARAM, SERIES_PARAM, POSTER_PARAM]) next.delete(key)
  const parts = [...next].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  if (selection.saved) parts.push(`${SAVED_PARAM}=1`)
  else if (selection.path.length) parts.push(`${CATEGORY_PARAM}=${selection.path.map(encodeURIComponent).join('/')}`)
  if (series) parts.push(`${SERIES_PARAM}=${encodeURIComponent(series)}`)
  if (poster) parts.push(`${POSTER_PARAM}=${encodeURIComponent(poster)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

// The chip rows to draw: the roots, then the children of each chosen level that has any.
export function chipRows(filters: readonly FilterNode[], path: readonly string[]): FilterNode[][] {
  const rows: FilterNode[][] = [[...filters]]
  let level = filters
  for (const slug of path) {
    const node = level.find((item) => item.slug === slug)
    if (!node || node.children.length === 0) break
    rows.push(node.children)
    level = node.children
  }
  return rows
}

// What the grid shows. Saved lists the saved templates newest first, series members included;
// with none (the last one was just removed, or 我的收藏 opened it with nothing saved) it stays
// on Saved and the page shows its empty state (Owner 2026-11-13).
// A path shows every card in that category and below it, in the catalogue's order.
export function filterCatalogue(entries: readonly GridEntry[], saved: readonly CatalogueTemplate[], chosen: Selection) {
  const active = chosen
  if (active.saved) return { active, shown: saved.map((template): GridEntry => ({ type: 'template', template, path: [] })) }
  return { active, shown: active.path.length ? entries.filter((entry) => pathStartsWith(entry.path, active.path)) : [...entries] }
}

// Every template a page can open: the grid's own and each series' members, once.
export function openableTemplates(entries: readonly GridEntry[]): CatalogueTemplate[] {
  const seen = new Map<string, CatalogueTemplate>()
  for (const entry of entries) {
    const list = entry.type === 'template' ? [entry.template] : entry.series.members
    for (const template of list) if (!seen.has(template.id)) seen.set(template.id, template)
  }
  return [...seen.values()]
}
