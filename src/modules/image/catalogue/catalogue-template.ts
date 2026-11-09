import { FULL_IMAGE_OPTIONS, type ImageOptions } from '@/core/templates/image-options'
import type { CoverMediaType, CreditsCost, LocalizedTemplate, ToggleConfirm } from '@/core/templates'

// What the browser needs of a template to draw its card, preview and workspace header. Plain
// data so server pages can hand it to client components; prompts never reach it.
export type CatalogueTemplate = {
  id: string
  name: string
  // The template_categories key (T75), its name in the page's language, its place in the
  // category order, and whether its cards are the drag compare (card_style = 'compare').
  category: string
  categoryName: string
  categoryOrder: number
  compare: boolean
  // The translated one-liner (templates.translations), when the page's language has one.
  description: string | null
  photoInput?: 'required' | 'optional' | 'none'
  imageOptions?: ImageOptions
  creditsCost: CreditsCost
  // Text the template asks for (a headline, a price); most templates have none (DESIGN §4.3).
  copyFields: { key: string; label: string; placeholder?: string; required: boolean; maxLength: number }[]
  // On/off options (T89), off by default, in the page's language; [] for most templates.
  toggles: CatalogueToggle[]
  cover: {
    type: CoverMediaType
    before: string | null
    after: string | null
    // Animated WebP or MP4, and its first frame (the split image), for motion templates.
    motion: string | null
    poster: string | null
  }
}

export type CatalogueToggle = { key: string; label: string; hint?: string; confirm?: ToggleConfirm }

// Pass a template already through localizeTemplate (core/templates) for the page's language.
export function toCatalogueTemplate(template: LocalizedTemplate): CatalogueTemplate {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    categoryName: template.categoryView.name,
    categoryOrder: template.categoryView.sortOrder,
    compare: template.categoryView.compare,
    description: template.description ?? null,
    photoInput: template.fields.images.max === 0 ? 'none' : template.fields.images.min === 0 ? 'optional' : 'required',
    imageOptions: template.imageOptions ?? FULL_IMAGE_OPTIONS,
    creditsCost: template.creditsCost,
    copyFields: template.fields.copy.map(({ key, label, placeholder, required, maxLength }) => ({
      key,
      label,
      ...(placeholder ? { placeholder } : {}),
      required,
      maxLength,
    })),
    toggles: (template.fields.toggles ?? []).map(({ key, label, hint, confirm }) => ({ key, label, ...(hint ? { hint } : {}), ...(confirm ? { confirm } : {}) })),
    cover: {
      type: template.coverMediaType,
      before: template.coverBeforeUrl,
      after: template.coverAfterUrl,
      motion: template.coverVideoUrl,
      poster: template.coverPosterUrl,
    },
  }
}

export const allowsNoPhoto = (template: CatalogueTemplate | null) => template?.photoInput === 'optional' || template?.photoInput === 'none'

export type CatalogueCategory = { key: string; name: string }

// The categories that have templates, in the order set in 分类管理 (T75), each once.
export function categoriesOf(templates: readonly CatalogueTemplate[]): CatalogueCategory[] {
  const seen = new Map<string, CatalogueTemplate>()
  for (const template of templates) if (!seen.has(template.category)) seen.set(template.category, template)
  return [...seen.values()]
    .sort((a, b) => a.categoryOrder - b.categoryOrder)
    .map((template) => ({ key: template.category, name: template.categoryName }))
}

export function cardPrice(template: CatalogueTemplate) {
  const options = template.imageOptions ?? FULL_IMAGE_OPTIONS
  if ((!options.originalRatio && !options.aspectRatios.length) || !options.resolutions.length) return null
  return Math.min(...options.resolutions.map((tier) => template.creditsCost[tier]))
}

// A motion card plays only with both its file and its poster (the table check guarantees it).
export function isMotion(template: CatalogueTemplate): boolean {
  return template.cover.type !== 'image' && template.cover.motion !== null && template.cover.poster !== null
}

// The drag compare (DESIGN §6.9 item 1) belongs to categories whose card style is 'compare'
// (today 画风 / Art Styles), set in 分类管理, never matched by name (T75).
export const isCompareCategory = (template: CatalogueTemplate) => template.compare

// Both stills present: the card can show the side-by-side pair (or the compare).
export function hasStills(template: CatalogueTemplate): boolean {
  return template.cover.before !== null && template.cover.after !== null
}
