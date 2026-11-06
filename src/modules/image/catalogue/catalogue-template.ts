import type { CoverMediaType, CreditsCost, Template } from '@/core/templates'

// What the browser needs of a template to draw its card, preview and workspace header. Plain
// data so server pages can hand it to client components; prompts never reach it.
export type CatalogueTemplate = {
  id: string
  name: string
  category: string
  // The translated one-liner (templates.translations), when the page's language has one.
  description: string | null
  creditsCost: CreditsCost
  // Text the template asks for (a headline, a price); most templates have none (DESIGN §4.3).
  copyFields: { key: string; label: string; placeholder?: string; required: boolean; maxLength: number }[]
  cover: {
    type: CoverMediaType
    before: string | null
    after: string | null
    // Animated WebP or MP4, and its first frame (the split image), for motion templates.
    motion: string | null
    poster: string | null
  }
}

// Pass a template already through localizeTemplate (core/templates) for the page's language.
export function toCatalogueTemplate(template: Template & { description?: string | null }): CatalogueTemplate {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description ?? null,
    creditsCost: template.creditsCost,
    copyFields: template.fields.copy.map(({ key, label, placeholder, required, maxLength }) => ({
      key,
      label,
      ...(placeholder ? { placeholder } : {}),
      required,
      maxLength,
    })),
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

// The card's one price is the Standard ('1k') number (DESIGN §4.2).
export const cardPrice = (template: CatalogueTemplate) => template.creditsCost['1k']

// A motion card plays only with both its file and its poster (the table check guarantees it).
export function isMotion(template: CatalogueTemplate): boolean {
  return template.cover.type !== 'image' && template.cover.motion !== null && template.cover.poster !== null
}

// Art Styles is the one category that keeps the drag compare (DESIGN §6.9 item 1). Categories
// are data; this is the stored (English) name of the first one in the catalogue.
export const ART_STYLES = 'Art Styles'
export const isArtStyle = (template: CatalogueTemplate) => template.category === ART_STYLES

// Both stills present: the card can show the side-by-side pair (or the compare).
export function hasStills(template: CatalogueTemplate): boolean {
  return template.cover.before !== null && template.cover.after !== null
}
