import type { CataloguePayload } from './catalogue-payload'
import type { CatalogueTemplate } from './catalogue-template'
import type { FilterNode } from './catalogue-view'
import type { PickerBrowse } from './picker-browse'

// Create's grid as a public, versioned file (/api/catalogue/public/<locale>/<version>): what any
// visitor may see of a published template, nothing per account. The browser keeps it on the
// device (catalogue-store.ts) and draws the grid from it at once; the account's part (balance,
// saved templates, tier, an entitlement-gated catalogue) streams from the page.
//
// Bump CATALOGUE_SCHEMA whenever the shape below changes: a device copy of another schema is
// dropped and read afresh.
export const CATALOGUE_SCHEMA = 1

export type PublicCatalogue = { schema: number; locale: string; version: string; payload: CataloguePayload }

// Every field a template card and its summary may carry. Anything else on a template (a new
// internal column, a prompt, a cost, a provider) is dropped, whatever the source adds later.
export const PUBLIC_TEMPLATE_KEYS = [
  'id', 'name', 'category', 'categoryName', 'categoryOrder', 'compare', 'privateOnly', 'poster', 'description',
  'photoInput', 'imageOptions', 'creditsCost', 'imagesPerSet', 'copyFields', 'toggles', 'formDeferred',
  'hasDeferredSlots', 'hasDeferredGroups', 'cover',
] as const satisfies readonly (keyof CatalogueTemplate)[]
const COVER_KEYS = ['type', 'before', 'after', 'motion', 'poster'] as const
const SERIES_KEYS = ['id', 'slug', 'name', 'description', 'cover', 'categoryName', 'memberIds'] as const
const FILTER_KEYS = ['slug', 'name', 'key', 'intro', 'alias'] as const

function pick<T extends object>(source: T, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key]
    if (value !== undefined) out[key] = value
  }
  return out as Partial<T>
}

function publicTemplate(template: CatalogueTemplate): CatalogueTemplate {
  const picked = pick(template, PUBLIC_TEMPLATE_KEYS) as CatalogueTemplate
  return { ...picked, cover: pick(template.cover, COVER_KEYS) as CatalogueTemplate['cover'] }
}

function publicFilters(nodes: readonly FilterNode[]): FilterNode[] {
  return nodes.map((node) => ({ ...(pick(node, FILTER_KEYS) as FilterNode), children: publicFilters(node.children) }))
}

function publicBrowse(browse: PickerBrowse): PickerBrowse {
  return {
    filters: publicFilters(browse.filters),
    entries: browse.entries.map((entry) =>
      entry.type === 'template'
        ? { type: 'template', id: entry.id, path: entry.path }
        : { type: 'series', series: pick(entry.series, SERIES_KEYS) as typeof entry.series, path: entry.path }),
  }
}

// `posters`: whether the dense-text poster templates are for every account (feature dense_poster
// with no tier gate). With a gate they are entitlement-specific: they stay out of this file, and an
// entitled account gets its catalogue from the page instead.
export function toPublicPayload(payload: CataloguePayload, { posters }: { posters: boolean }): CataloguePayload {
  const templates = payload.templates.filter((template) => posters || !template.poster).map(publicTemplate)
  const kept = new Set(templates.map((template) => template.id))
  const browse = publicBrowse(payload.browse)
  const entries = browse.entries.flatMap((entry): PickerBrowse['entries'] => {
    if (entry.type === 'template') return kept.has(entry.id) ? [entry] : []
    const memberIds = entry.series.memberIds.filter((id) => kept.has(id))
    return memberIds.length ? [{ ...entry, series: { ...entry.series, memberIds } }] : []
  })
  return { browse: { ...browse, entries }, templates }
}

// The version a device copy is checked against: 16 hex characters of the body's SHA-256.
export const VERSION_PATTERN = /^[0-9a-f]{16}$/

// A device copy is used only when it is exactly this file for this language and schema.
const isVersion = (value: unknown): value is string => typeof value === 'string' && VERSION_PATTERN.test(value)
const hasPayload = (payload: unknown): payload is CataloguePayload =>
  Boolean(payload) && Array.isArray((payload as CataloguePayload).templates) && Array.isArray((payload as CataloguePayload).browse?.entries)

export function isPublicCatalogue(value: unknown, locale: string): value is PublicCatalogue {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PublicCatalogue>
  return record.schema === CATALOGUE_SCHEMA && record.locale === locale && isVersion(record.version) && hasPayload(record.payload)
}
