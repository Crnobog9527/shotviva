import type { TemplateCategory, TemplateMedia, TryTemplate } from '@/core/content'
import type { LocalizedTemplate } from '@/core/templates'

// The home page's (and landing pages') template sections, read from the database (T53,
// ARCHITECTURE §12 home item 3): the featured templates (featured_rank, chosen in admin) grouped
// under their categories in the order set in 分类管理 (T75), a category with none hidden. Name
// and description in the page's language (T52), category name and intro from
// template_categories, covers from the template itself. With nothing featured, the six most
// recently published.
export const FALLBACK_COUNT = 6

type Live = Pick<
  LocalizedTemplate,
  'id' | 'name' | 'description' | 'category' | 'categoryView' | 'coverBeforeUrl' | 'coverAfterUrl' | 'featuredRank' | 'createdAt' | 'creditsCost'
>

export function featuredTemplates<T extends Live>(live: readonly T[]): T[] {
  const ranked = live.filter((template) => template.featuredRank !== null).sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
  if (ranked.length > 0) return ranked
  return [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, FALLBACK_COUNT)
}

type Group = { view: Live['categoryView']; templates: Live[] }

// One group per category that has a featured template, in category order.
function grouped(featured: readonly Live[]): Group[] {
  const groups = new Map<string, Group>()
  for (const template of featured) {
    const group = groups.get(template.category) ?? { view: template.categoryView, templates: [] }
    group.templates.push(template)
    groups.set(template.category, group)
  }
  return [...groups.values()].sort((a, b) => a.view.sortOrder - b.view.sortOrder)
}

function toCategory({ view, templates }: Group): TemplateCategory {
  const [first, ...rest] = templates.map((template) => ({ id: template.id, name: template.name, use: template.description ?? '', credits: template.creditsCost['1k'] }))
  return {
    name: view.name,
    intro: view.intro,
    ...(view.compare ? { drag: true } : {}),
    templates: [first as TemplateCategory['templates'][0], ...rest],
  }
}

// `keys`: only these categories (a landing page's); the generator opens on the first featured
// template among them.
export function featuredSections(live: readonly Live[], keys?: readonly string[]) {
  const wanted = keys ? new Set(keys) : null
  const featured = featuredTemplates(live).filter((template) => !wanted || wanted.has(template.category))
  const media: Record<string, TemplateMedia> = Object.fromEntries(
    featured.map((template) => [template.id, { before: template.coverBeforeUrl, after: template.coverAfterUrl, live: true }]),
  )
  return { categories: grouped(featured).map(toCategory), media, defaultId: featured[0]?.id ?? live[0]?.id ?? null }
}

// The 404's "three templates to try instead": featured templates with both covers, never a
// drag-compare category (画风).
export function tryTemplates(live: readonly Live[]): TryTemplate[] {
  return grouped(featuredTemplates(live))
    .filter((group) => !group.view.compare)
    .flatMap((group) => group.templates)
    .flatMap((template) =>
      template.coverBeforeUrl && template.coverAfterUrl
        ? [{ id: template.id, name: template.name, use: template.description ?? '', credits: template.creditsCost['1k'], before: template.coverBeforeUrl, after: template.coverAfterUrl }]
        : [],
    )
}
