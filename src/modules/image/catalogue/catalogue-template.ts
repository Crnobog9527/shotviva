import type { CoverMediaType, CreditsCost, Template } from '@/core/templates'

// What the browser needs of a template to draw its card, preview and workspace header. Plain
// data so server pages can hand it to client components; prompts never reach it.
export type CatalogueTemplate = {
  id: string
  name: string
  category: string
  creditsCost: CreditsCost
  // Text the template asks for (a headline, a price); most templates have none (DESIGN §4.3).
  copyFields: { key: string; label: string; required: boolean; maxLength: number }[]
  cover: {
    type: CoverMediaType
    before: string | null
    after: string | null
    // Animated WebP or MP4, and its first frame (the split image), for motion templates.
    motion: string | null
    poster: string | null
  }
}

export function toCatalogueTemplate(template: Template): CatalogueTemplate {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    creditsCost: template.creditsCost,
    copyFields: template.fields.copy.map(({ key, label, required, maxLength }) => ({ key, label, required, maxLength })),
    cover: {
      type: template.coverMediaType,
      before: template.coverBeforeUrl,
      after: template.coverAfterUrl,
      motion: template.coverVideoUrl,
      poster: template.coverPosterUrl,
    },
  }
}

// Filter chips in catalogue order (templates come sorted by sort_order).
export function categoriesOf(templates: readonly CatalogueTemplate[]): string[] {
  return [...new Set(templates.map((template) => template.category))]
}

// The card's one price: the Standard ('1k') number (DESIGN §4.2).
export const creditsLabel = (n: number) => `${n} ${n === 1 ? 'credit' : 'credits'}`
export const fromCreditsLabel = (template: CatalogueTemplate) => `from ${creditsLabel(template.creditsCost['1k'])}`

// A motion card plays only with both its file and its poster (the table check guarantees it).
export function isMotion(template: CatalogueTemplate): boolean {
  return template.cover.type !== 'image' && template.cover.motion !== null && template.cover.poster !== null
}
