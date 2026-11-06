import type { CategoryCopy, TemplateCategory, TemplateMedia, TryTemplate } from '@/core/content'
import type { LocalizedTemplate } from '@/core/templates'

// The home page's (and landing pages') template sections, read from the database (T53,
// ARCHITECTURE §12 home item 3): the featured templates (featured_rank, chosen in admin) grouped
// under the §5 categories in §5 order, a category with none hidden. Name and description in
// the page's language (T52), covers from the template itself. With nothing featured, the six
// most recently published.
export const FALLBACK_COUNT = 6

type Live = Pick<LocalizedTemplate, 'id' | 'name' | 'description' | 'category' | 'coverBeforeUrl' | 'coverAfterUrl' | 'featuredRank' | 'createdAt'>

export function featuredTemplates<T extends Live>(live: readonly T[]): T[] {
  const ranked = live.filter((template) => template.featuredRank !== null).sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
  if (ranked.length > 0) return ranked
  return [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, FALLBACK_COUNT)
}

const keyOf = (category: string) => category.trim().toLowerCase()

type Group = { copy: CategoryCopy | undefined; raw: string; templates: Live[] }

// §5 categories first, in §5 order; a category the copy does not know comes after, under its
// stored name, so a new category in admin still shows.
function grouped(copy: readonly CategoryCopy[], featured: readonly Live[]): Group[] {
  const groups = new Map<string, Group>(copy.map((entry) => [keyOf(entry.key), { copy: entry, raw: entry.key, templates: [] }]))
  for (const template of featured) {
    const key = keyOf(template.category)
    const group = groups.get(key) ?? { copy: undefined, raw: template.category, templates: [] }
    group.templates.push(template)
    groups.set(key, group)
  }
  return [...groups.values()].filter((group) => group.templates.length > 0)
}

function toCategory({ copy, raw, templates }: Group): TemplateCategory {
  const [first, ...rest] = templates.map((template) => ({ id: template.id, name: template.name, use: template.description ?? '' }))
  return {
    name: copy?.name ?? raw,
    intro: copy?.intro ?? '',
    ...(copy?.drag ? { drag: true } : {}),
    ...(copy?.links ? { links: copy.links } : {}),
    templates: [first as TemplateCategory['templates'][0], ...rest],
  }
}

// `keys`: only these categories (a landing page's); the generator opens on the first featured
// template among them.
export function featuredSections(copy: readonly CategoryCopy[], live: readonly Live[], keys?: readonly string[]) {
  const wanted = keys ? new Set(keys.map(keyOf)) : null
  const featured = featuredTemplates(live).filter((template) => !wanted || wanted.has(keyOf(template.category)))
  const groups = grouped(copy, featured)
  const media: Record<string, TemplateMedia> = Object.fromEntries(
    featured.map((template) => [template.id, { before: template.coverBeforeUrl, after: template.coverAfterUrl, live: true }]),
  )
  return { categories: groups.map(toCategory), media, defaultId: featured[0]?.id ?? live[0]?.id ?? null }
}

// The 404's "three templates to try instead": featured templates with both covers, never the
// drag-compare category (Art Styles).
export function tryTemplates(copy: readonly CategoryCopy[], live: readonly Live[]): TryTemplate[] {
  return grouped(copy, featuredTemplates(live))
    .filter((group) => !group.copy?.drag)
    .flatMap((group) => group.templates)
    .flatMap((template) =>
      template.coverBeforeUrl && template.coverAfterUrl
        ? [{ id: template.id, name: template.name, use: template.description ?? '', before: template.coverBeforeUrl, after: template.coverAfterUrl }]
        : [],
    )
}
