import type { TemplateFields, TemplateSurface } from './schema'

export type Template = {
  id: string
  module: 'image' | 'video'
  name: string
  category: string
  coverBeforeUrl: string | null
  coverAfterUrl: string | null
  fields: TemplateFields
  creditsCost: number
  sortOrder: number
  isActive: boolean
  visibleIn: TemplateSurface[]
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
  fields: TemplateFields
  credits_cost: number
  sort_order: number
  is_active: boolean
  visible_in: TemplateSurface[]
  created_at: string
  updated_at: string
}

export const TEMPLATE_COLUMNS =
  'id, module, name, category, cover_before_url, cover_after_url, fields, credits_cost, sort_order, is_active, visible_in, created_at, updated_at'

export function toTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    module: row.module,
    name: row.name,
    category: row.category,
    coverBeforeUrl: row.cover_before_url,
    coverAfterUrl: row.cover_after_url,
    fields: row.fields,
    creditsCost: row.credits_cost,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    visibleIn: row.visible_in,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
