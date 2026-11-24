import type { Locale } from '../i18n'

// What the public /template-requests page shows of the wishlist (public-wall.ts): the templates
// built from requests, by name. Never a request's text, photos or author (Owner 2026-11-25:
// requests stay inside the signed-in wishlist).
export type ShippedTemplate = { id: string; name: string }

export const PUBLIC_SHIPPED_MAX = 6

export type ShippedRow = { template_id: string | null }
export type TemplateNameRow = { id: string; name: string; translations: { zh?: { name?: string | null } } | null }

// The template's name in the page's language, English when the Chinese one is missing.
function nameIn(row: TemplateNameRow, locale: Locale): string {
  const zh = row.translations?.zh?.name?.trim()
  return locale === 'zh' && zh ? zh : row.name
}

// Newest first, each template once. A template that is hidden or unpublished (not in `visible`,
// read under the anonymous role) is left out: the section only lists templates a visitor can open,
// and is hidden altogether when none is left, never faked.
export function shippedTemplates(rows: readonly ShippedRow[], visible: readonly TemplateNameRow[], locale: Locale): ShippedTemplate[] {
  const byId = new Map(visible.map((row) => [row.id, row]))
  const seen = new Set<string>()
  const out: ShippedTemplate[] = []
  for (const { template_id: id } of rows) {
    const template = id ? byId.get(id) : undefined
    if (!template || seen.has(template.id)) continue
    seen.add(template.id)
    out.push({ id: template.id, name: nameIn(template, locale) })
  }
  return out.slice(0, PUBLIC_SHIPPED_MAX)
}
