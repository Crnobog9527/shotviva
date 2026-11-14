import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { seriesCopy as copy } from './copy'
import { autoCovers, type SeriesListItem } from './list-rules'

// 系列管理 list and batch tools (Owner 2026-11-12). The list is small (one row per series), so it is
// read whole: drag ordering needs every series, and saving sends the whole order (1296).
const LIMIT = 500
export const reorderSchema = z.array(z.uuid()).min(1).max(LIMIT).refine(ids => new Set(ids).size === ids.length)
export const flagSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200).refine(ids => new Set(ids).size === ids.length),
  field: z.enum(['is_active', 'show_members']), value: z.boolean(),
  reason: z.string().trim().max(500).nullable(),
}).refine(input => input.field !== 'is_active' || input.value || !!input.reason)
export type FlagInput = z.infer<typeof flagSchema>

const rowsSchema = z.array(z.object({
  id: z.uuid(), name_zh: z.string(), slug: z.string(), is_active: z.boolean(), show_members: z.boolean(),
  sort_order: z.int32(), cover_url: z.string().nullable(),
}))
const membersSchema = z.array(z.object({
  series_id: z.uuid(), series_sort_order: z.int32(), is_active: z.boolean(), visible_in: z.array(z.string()),
  cover_after_url: z.string().nullable(), cover_before_url: z.string().nullable(), cover_locales: z.record(z.string(), z.unknown()).nullable(),
}))

export async function listAdminSeries(db: SupabaseClient): Promise<SeriesListItem[]> {
  const series = await db.from('template_series')
    .select('id,name_zh,slug,is_active,show_members,sort_order,cover_url').is('deleted_at', null).order('sort_order').order('id').limit(LIMIT)
  if (series.error) throw new AppError('INTERNAL', 'list series failed', { cause: series.error })
  const rows = rowsSchema.parse(series.data)
  if (!rows.length) return []
  const members = await db.from('templates')
    .select('series_id,series_sort_order,is_active,visible_in,cover_after_url,cover_before_url,cover_locales')
    .in('series_id', rows.map(row => row.id)).order('series_sort_order').order('id')
  if (members.error) throw new AppError('INTERNAL', 'list series members failed', { cause: members.error })
  return autoCovers(rows, membersSchema.parse(members.data))
}

// 已删除 (1500): read-only, newest first. Deleted series never take part in ordering or batch flags.
const deletedSchema = z.array(z.object({ id: z.uuid(), name_zh: z.string(), slug: z.string(), deleted_at: z.string() }))
export type DeletedSeries = z.infer<typeof deletedSchema>[number]
export async function listDeletedSeries(db: SupabaseClient): Promise<DeletedSeries[]> {
  const { data, error } = await db.from('template_series').select('id,name_zh,slug,deleted_at')
    .not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).order('id').limit(LIMIT)
  if (error) throw new AppError('INTERNAL', 'list deleted series failed', { cause: error })
  return deletedSchema.parse(data)
}

const MESSAGES: Record<string, string> = { SERIES_CHANGED: copy.listChanged, SERIES_REASON_REQUIRED: copy.reason }
function fail(name: string, error: { message: string }): never {
  if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
  if (MESSAGES[error.message]) throw new AppError('INVALID_INPUT', MESSAGES[error.message])
  throw new AppError('INTERNAL', name + ' failed', { cause: error })
}

export async function reorderAdminSeries(db: SupabaseClient, actor: string, input: unknown) {
  const ids = reorderSchema.safeParse(input)
  if (!ids.success) throw new AppError('INVALID_INPUT', copy.listChanged)
  const { data, error } = await db.rpc('admin_reorder_template_series', { p_actor: actor, p_ids: ids.data })
  if (error) fail('admin_reorder_template_series', error)
  logger.info('admin.series.reordered', { adminId: actor, moved: data })
  return z.int().nonnegative().parse(data)
}

export async function setAdminSeriesFlag(db: SupabaseClient, actor: string, input: unknown) {
  const parsed = flagSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.batchInvalid)
  const { ids, field, value, reason } = parsed.data
  const { data, error } = await db.rpc('admin_set_template_series_flag', {
    p_actor: actor, p_ids: ids, p_field: field, p_value: value, p_reason: reason,
  })
  if (error) fail('admin_set_template_series_flag', error)
  logger.info('admin.series.batch', { adminId: actor, field, value, count: ids.length, changed: data })
  return z.int().nonnegative().parse(data)
}
