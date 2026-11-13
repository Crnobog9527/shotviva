import { FULL_IMAGE_OPTIONS, type ImageOptions } from '@/core/templates/image-options'
import type { CopyFieldType, CoverMediaType, CreditsCost, LocalizedTemplate, ToggleConfirm } from '@/core/templates'

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
  // Its root category keeps every work private, free ones too (the posters root, §9 第 7 条).
  privateOnly?: boolean
  // The translated one-liner (templates.translations), when the page's language has one.
  description: string | null
  photoInput?: 'required' | 'optional' | 'none'
  imageOptions?: ImageOptions
  creditsCost: CreditsCost
  // Text the template asks for (a headline, a price); most templates have none (DESIGN §4.3).
  copyFields: CatalogueCopyField[]
  // On/off options (T89), off by default, in the page's language; [] for most templates.
  toggles: CatalogueToggle[]
  // Named upload boxes in send order (§5.1e), in the page's language; absent or [] for a
  // template that takes the single photo.
  imageSlots?: CatalogueImageSlot[]
  cover: {
    type: CoverMediaType
    before: string | null
    after: string | null
    // Animated WebP or MP4, and its first frame (the split image), for motion templates.
    motion: string | null
    poster: string | null
  }
}

// A text field in the page's language (ARCHITECTURE §5 fields.copy). A choice field's `value` is
// the English option the server checks; `label` is how this language shows it. `public`: the
// gallery's one-click reuse may carry this field's text to another user (§9 第 3 条).
export type CatalogueCopyField = {
  key: string
  label: string
  type: CopyFieldType
  placeholder?: string
  help?: string
  required: boolean
  maxLength: number
  options?: { value: string; label: string }[]
  min?: number
  max?: number
  public: boolean
}

// note: the text field (copyFields key) drawn right under the box.
export type CatalogueImageSlot = { key: string; label: string; help?: string; required: boolean; note?: string }

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
    privateOnly: template.categoryInfo.galleryExcluded ?? false,
    description: template.description ?? null,
    photoInput: template.fields.images.max === 0 ? 'none' : template.fields.images.min === 0 ? 'optional' : 'required',
    imageOptions: template.imageOptions ?? FULL_IMAGE_OPTIONS,
    creditsCost: template.creditsCost,
    copyFields: template.fields.copy.map(toCatalogueCopy),
    imageSlots: (template.fields.images.slots ?? []).map(({ key, label, help, required, note }) => ({ key, label, required, ...(help ? { help } : {}), ...(note ? { note } : {}) })),
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

type LocalizedCopy = LocalizedTemplate['fields']['copy'][number]

function toCatalogueCopy({ key, label, type, placeholder, help, required, maxLength, options, optionLabels, min, max, public: shown }: LocalizedCopy): CatalogueCopyField {
  return {
    key, label, type: type ?? 'short', required, maxLength, public: shown ?? false,
    ...(placeholder ? { placeholder } : {}),
    ...(help ? { help } : {}),
    ...(type === 'select' && options ? { options: options.map((value) => ({ value, label: optionLabels?.[value] ?? value })) } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  }
}

export const slotsOfTemplate = (template: Pick<CatalogueTemplate, 'imageSlots'> | null): CatalogueImageSlot[] => template?.imageSlots ?? []
export const isSlotTemplate = (template: Pick<CatalogueTemplate, 'imageSlots'> | null) => slotsOfTemplate(template).length > 0

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
export function isMotion(template: Pick<CatalogueTemplate, 'cover'>): boolean {
  return template.cover.type !== 'image' && template.cover.motion !== null && template.cover.poster !== null
}

// The drag compare (DESIGN §6.9 item 1) belongs to categories whose card style is 'compare'
// (today 画风 / Art Styles), set in 分类管理, never matched by name (T75).
export const isCompareCategory = (template: Pick<CatalogueTemplate, 'compare'>) => template.compare

// Both stills present: the card can show the side-by-side pair (or the compare).
export function hasStills(template: Pick<CatalogueTemplate, 'cover'>): boolean {
  return template.cover.before !== null && template.cover.after !== null
}
