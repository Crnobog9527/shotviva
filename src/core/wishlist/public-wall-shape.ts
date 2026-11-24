import type { Locale } from '../i18n'

// What the public /template-requests page may show of a request (public-wall.ts): never the
// author, never the reference photos.
export type PublicRequest = {
  id: string
  description: string
  status: 'live' | 'shipped'
  votesCount: number
  // Shipped only, and only while the template is open to everyone.
  template: { id: string; name: string } | null
}
export type PublicWall = { wanted: PublicRequest[]; shipped: PublicRequest[] }

export const PUBLIC_WANTED_MAX = 12
export const PUBLIC_SHIPPED_MAX = 6

export type PublicWallRow = { id: string; description: string; status: 'live' | 'shipped'; votes_count: number; template_id: string | null }
export type TemplateNameRow = { id: string; name: string; translations: { zh?: { name?: string | null } } | null }

// The template's name in the page's language, English when the Chinese one is missing.
function nameIn(row: TemplateNameRow, locale: Locale): string {
  const zh = row.translations?.zh?.name?.trim()
  return locale === 'zh' && zh ? zh : row.name
}

const toRequest = (row: PublicWallRow, template: PublicRequest['template']): PublicRequest => ({
  id: row.id,
  description: row.description,
  status: row.status,
  votesCount: row.votes_count,
  template,
})

// A shipped request whose template is hidden or unpublished is left out: the section only lists
// templates a visitor can open (it is hidden altogether when none is left, never faked).
export function toPublicWall(live: readonly PublicWallRow[], shipped: readonly PublicWallRow[], templates: readonly TemplateNameRow[], locale: Locale): PublicWall {
  const byId = new Map(templates.map((row) => [row.id, row]))
  const built = shipped.flatMap((row) => {
    const template = row.template_id ? byId.get(row.template_id) : undefined
    return template ? [toRequest(row, { id: template.id, name: nameIn(template, locale) })] : []
  })
  return { wanted: live.slice(0, PUBLIC_WANTED_MAX).map((row) => toRequest(row, null)), shipped: built.slice(0, PUBLIC_SHIPPED_MAX) }
}
