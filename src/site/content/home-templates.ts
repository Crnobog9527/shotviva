import type { TemplateCard, TemplateCategory, TemplateMedia, TryTemplate } from '@/core/content'
import type { LocalizedTemplate } from '@/core/templates'
import type { PublicSeries } from '@/core/templates/public-series'

// The home page's (and landing pages') template sections, read from the database (T53,
// ARCHITECTURE §12 home item 3): the featured templates (featured_rank, chosen in admin) grouped
// under their categories in the order set in 分类管理 (T75), a category with none hidden. Name
// and description in the page's language (T52), category name and intro from
// template_categories, covers from the template itself. With nothing featured, the six most
// recently published.
//
// Series (系列, T102; Owner 2026-11-12): a featured template that belongs to a live series shows
// as that series, once, where its first featured member stands; the series card shows its
// members' before/after pairs and opens the series in Create. Members also keep their own cards
// only when admin set the series to show them (show_members), as Create does.
export const FALLBACK_COUNT = 6
// Pairs a series card cycles through: enough to read as a set, few enough to stay light.
export const SERIES_PAIRS = 5

type Live = Pick<
  LocalizedTemplate,
  'id' | 'name' | 'description' | 'category' | 'categoryView' | 'coverBeforeUrl' | 'coverAfterUrl' | 'featuredRank' | 'createdAt' | 'creditsCost'
>
type Series = Pick<PublicSeries, 'id' | 'slug' | 'name' | 'description' | 'showMembers' | 'memberIds'>

// Create opens a series from the address (?series=<slug>, modules/image catalogue-filter.ts).
export const seriesHref = (slug: string) => `/generate?series=${encodeURIComponent(slug)}`

export function featuredTemplates<T extends Live>(live: readonly T[]): T[] {
  const ranked = live.filter((template) => template.featuredRank !== null).sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0))
  if (ranked.length > 0) return ranked
  return [...live].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, FALLBACK_COUNT)
}

// One featured place: a template, or a series standing where its first featured member stands.
type Entry = { template: Live; series: Series | null }

export function featuredEntries(featured: readonly Live[], series: readonly Series[]): Entry[] {
  const seriesOf = new Map(series.flatMap((one) => one.memberIds.map((id) => [id, one] as const)))
  const shown = new Set<string>()
  const entries: Entry[] = []
  for (const template of featured) {
    const one = seriesOf.get(template.id)
    if (one && !shown.has(one.id)) {
      shown.add(one.id)
      entries.push({ template, series: one })
    }
    if (!one || one.showMembers) entries.push({ template, series: null })
  }
  return entries
}

type Group = { view: Live['categoryView']; entries: Entry[] }

// One group per category that has a featured entry, in category order; a series sits in its
// first featured member's category.
function grouped(entries: readonly Entry[]): Group[] {
  const groups = new Map<string, Group>()
  for (const entry of entries) {
    const group = groups.get(entry.template.category) ?? { view: entry.template.categoryView, entries: [] }
    group.entries.push(entry)
    groups.set(entry.template.category, group)
  }
  return [...groups.values()].sort((a, b) => a.view.sortOrder - b.view.sortOrder)
}

const hasCovers = (template: Live | undefined): template is Live => Boolean(template?.coverBeforeUrl && template.coverAfterUrl)

// The members whose pairs the card shows, in series order, up to SERIES_PAIRS.
function pairMembers(series: Series, byId: ReadonlyMap<string, Live>): Live[] {
  return series.memberIds.map((id) => byId.get(id)).filter(hasCovers).slice(0, SERIES_PAIRS)
}

function toCard({ template, series }: Entry, byId: ReadonlyMap<string, Live>): TemplateCard {
  if (!series) return { id: template.id, name: template.name, use: template.description ?? '' }
  return {
    id: `series-${series.id}`,
    name: series.name,
    use: series.description ?? template.description ?? '',
    series: { href: seriesHref(series.slug), members: pairMembers(series, byId).map((member) => member.id), count: series.memberIds.length },
  }
}

function toCategory({ view, entries }: Group, byId: ReadonlyMap<string, Live>): TemplateCategory {
  const [first, ...rest] = entries.map((entry) => toCard(entry, byId))
  return { name: view.name, intro: view.intro, ...(view.compare ? { drag: true } : {}), templates: [first as TemplateCard, ...rest] }
}

const mediaOf = (template: Live): TemplateMedia => ({ before: template.coverBeforeUrl, after: template.coverAfterUrl, live: true })

// `keys`: only these categories (a landing page's); the generator opens on the first featured
// template among them. `series`: the live series (cachedPublicSeries); without them every
// template keeps its own card.
export function featuredSections(live: readonly Live[], keys?: readonly string[], series: readonly Series[] = []) {
  const wanted = keys ? new Set(keys) : null
  const featured = featuredTemplates(live).filter((template) => !wanted || wanted.has(template.category))
  const byId = new Map(live.map((template) => [template.id, template]))
  const entries = featuredEntries(featured, series)
  // Each card's covers, a series' pictured members included.
  const shown = entries.flatMap(({ template, series: one }) => (one ? pairMembers(one, byId) : [template]))
  const media: Record<string, TemplateMedia> = Object.fromEntries(shown.map((template) => [template.id, mediaOf(template)]))
  return { categories: grouped(entries).map((group) => toCategory(group, byId)), media, defaultId: featured[0]?.id ?? live[0]?.id ?? null }
}

// The 404's "three templates to try instead": featured entries with both covers, never a
// drag-compare category (画风). A series is one pick, pictured by its first member with covers,
// and opens the series.
export function tryTemplates(live: readonly Live[], series: readonly Series[] = []): TryTemplate[] {
  const byId = new Map(live.map((template) => [template.id, template]))
  return grouped(featuredEntries(featuredTemplates(live), series))
    .filter((group) => !group.view.compare)
    .flatMap((group) => group.entries)
    .flatMap(({ template, series: one }): TryTemplate[] => {
      const pictured = one ? pairMembers(one, byId)[0] : hasCovers(template) ? template : undefined
      if (!pictured?.coverBeforeUrl || !pictured.coverAfterUrl) return []
      const card = { before: pictured.coverBeforeUrl, after: pictured.coverAfterUrl }
      if (!one) return [{ id: template.id, name: template.name, use: template.description ?? '', ...card }]
      return [{ id: `series-${one.id}`, name: one.name, use: one.description ?? template.description ?? '', href: seriesHref(one.slug), ...card }]
    })
}
