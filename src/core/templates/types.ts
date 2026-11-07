import { CATEGORY_COLUMNS, preT75Category, toCategory, type Category, type CategoryRow } from './categories'
import type { CreditsCost, TemplateQuality } from './pricing'
import type { CoverMediaType, TemplateFields, TemplateSurface, TemplateTranslations } from './schema'

export type Template = {
  id: string
  module: 'image' | 'video'
  name: string
  // English one-line description (T52); null when not filled in. Read through localizeTemplate.
  description: string | null
  // The template_categories key (templates.category_key, T75); names and card style are in
  // categoryInfo.
  category: string
  categoryInfo: Category
  coverBeforeUrl: string | null
  coverAfterUrl: string | null
  // 'animated' / 'video' cards also have the motion file and its first frame.
  coverMediaType: CoverMediaType
  coverVideoUrl: string | null
  coverPosterUrl: string | null
  fields: TemplateFields
  // Sent to the model as `quality`; with the resolution it decides the price.
  quality: TemplateQuality
  // Credits per resolution; cards show the '1k' number ("From 2 credits", DESIGN §4.2).
  creditsCost: CreditsCost
  sortOrder: number
  isActive: boolean
  visibleIn: TemplateSurface[]
  // Other languages' display text; read through localizeTemplate (ARCHITECTURE §5).
  translations: TemplateTranslations
  // Home featured position (T53): 1..12, small first; null when not featured.
  featuredRank: number | null
  createdAt: string
  updatedAt: string
}

type TemplateRowBase = {
  id: string
  module: 'image' | 'video'
  name: string
  description: string | null
  cover_before_url: string | null
  cover_after_url: string | null
  cover_media_type: CoverMediaType
  cover_video_url: string | null
  cover_poster_url: string | null
  fields: TemplateFields
  quality: TemplateQuality
  // The table check guarantees exactly the three keys, each a positive integer.
  credits_cost: CreditsCost
  sort_order: number
  is_active: boolean
  visible_in: TemplateSurface[]
  translations: TemplateTranslations | null
  featured_rank: number | null
  created_at: string
  updated_at: string
}

// templates.category_key and its category, embedded through templates_category_key_fkey
// (never null: the column is not null). templates.category (the English name, kept in step by
// the 0581 trigger) is not read.
export type TemplateRow = TemplateRowBase & { category_key: string; template_categories: CategoryRow }
// The same read on a database before migrations 0580–0583 (see selectTemplates).
export type PreT75TemplateRow = TemplateRowBase & { category: string }

const BASE_COLUMNS =
  'id, module, name, description, cover_before_url, cover_after_url, cover_media_type, cover_video_url, cover_poster_url, fields, quality, credits_cost, sort_order, is_active, visible_in, translations, featured_rank, created_at, updated_at'
export const TEMPLATE_COLUMNS = `${BASE_COLUMNS}, category_key, template_categories(${CATEGORY_COLUMNS})`
export const PRE_T75_TEMPLATE_COLUMNS = `${BASE_COLUMNS}, category`

function categoryOf(row: TemplateRow | PreT75TemplateRow): Category {
  return 'template_categories' in row ? toCategory(row.template_categories) : preT75Category(row.category)
}

export function toTemplate(row: TemplateRow | PreT75TemplateRow): Template {
  const categoryInfo = categoryOf(row)
  return {
    id: row.id,
    module: row.module,
    name: row.name,
    description: row.description ?? null,
    category: categoryInfo.key,
    categoryInfo,
    coverBeforeUrl: row.cover_before_url,
    coverAfterUrl: row.cover_after_url,
    coverMediaType: row.cover_media_type,
    coverVideoUrl: row.cover_video_url,
    coverPosterUrl: row.cover_poster_url,
    fields: row.fields,
    quality: row.quality,
    creditsCost: row.credits_cost,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    visibleIn: row.visible_in,
    translations: row.translations ?? {},
    featuredRank: row.featured_rank ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
