import type { CreditsCost, TemplateQuality } from './pricing'
import type { CoverMediaType, TemplateFields, TemplateSurface, TemplateTranslations } from './schema'

export type Template = {
  id: string
  module: 'image' | 'video'
  name: string
  category: string
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
  createdAt: string
  updatedAt: string
}

export type TemplateRow = {
  id: string
  module: 'image' | 'video'
  name: string
  category: string
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
  created_at: string
  updated_at: string
}

export const TEMPLATE_COLUMNS =
  'id, module, name, category, cover_before_url, cover_after_url, cover_media_type, cover_video_url, cover_poster_url, fields, quality, credits_cost, sort_order, is_active, visible_in, translations, created_at, updated_at'

export function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    module: row.module,
    name: row.name,
    category: row.category,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
