import type { HomePage, TemplateMedia } from '@/core/content'

// What a live template brings to the home page: its id and the covers the admin set.
type LiveTemplate = { id: string; cover: { before: string | null; after: string | null } }

// The pair for every featured template (ARCHITECTURE §5's first batch): the bundled illustrative
// sample (public/home/templates, design/assets/img) until the admin sets a cover.
const bundled = (id: string) => ({ before: `/home/templates/${id}-before.webp`, after: `/home/templates/${id}-after.webp` })

// The generator opens on the same template as the hero pair (ARCHITECTURE §13 item 2).
const DEFAULT_TEMPLATE = 'pure-white'

export function homeTemplates(page: HomePage, live: readonly LiveTemplate[]) {
  const byId = new Map(live.map((template) => [template.id, template]))
  const ids = page.templateGrid.categories.flatMap((category) => category.templates.map((card) => card.id))
  const samples = Object.fromEntries(ids.map((id) => [id, bundled(id)]))
  const cards: Record<string, TemplateMedia> = {}
  for (const id of ids) {
    const found = byId.get(id)
    const covers = found?.cover.before && found.cover.after ? { before: found.cover.before, after: found.cover.after } : bundled(id)
    cards[id] = { ...covers, live: Boolean(found) }
  }
  const defaultId = byId.has(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : (live[0]?.id ?? null)
  return { samples, cards, defaultId }
}
