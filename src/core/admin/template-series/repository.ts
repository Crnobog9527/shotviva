import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { seriesCopy as copy } from './copy'
import type { SeriesCandidate, SeriesDetail } from './types'
import { saveSeriesSchema, searchSchema } from './validation'

const PAGE = 30
const MESSAGES: Record<string, string> = {
  INVALID_SERIES_CATEGORY: copy.invalidCategory, SERIES_CHANGED: copy.changed,
  INVALID_SERIES_MEMBERS: copy.invalidMembers, SERIES_MEMBER_TAKEN: copy.memberTaken,
  SERIES_REASON_REQUIRED: copy.reason,
}

export async function saveAdminSeries(db: SupabaseClient, actor: string, input: unknown) {
  const parsed = saveSeriesSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.invalid)
  const { id, revision, fields, members, reason } = parsed.data
  const { data, error } = await db.rpc('admin_save_template_series', {
    p_id: id, p_revision: revision, p_fields: fields, p_members: members, p_actor: actor, p_reason: reason,
  }).returns<string>()
  if (error) {
    if (error.code === '23505') throw new AppError('INVALID_INPUT', copy.slugTaken)
    if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
    if (MESSAGES[error.message]) throw new AppError('INVALID_INPUT', MESSAGES[error.message])
    throw new AppError('INTERNAL', 'admin_save_template_series failed', { cause: error })
  }
  if (!data) throw new AppError('INTERNAL', 'missing saved series id')
  logger.info('admin.series.saved', { adminId: actor, seriesId: data, active: fields.is_active, memberCount: members.length, reason })
  return data
}

export async function getAdminSeries(db: SupabaseClient, id: string) {
  const { data, error } = await db.rpc('admin_template_series_detail', { p_id: id }).returns<SeriesDetail | null>()
  if (error) throw new AppError('INTERNAL', 'admin_template_series_detail failed', { cause: error })
  return data
}

export async function searchSeriesCandidates(db: SupabaseClient, search: unknown, after: unknown) {
  const parsed = searchSchema.safeParse({ search, after })
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.search)
  const response = await db.rpc('admin_series_candidates', {
    p_search: parsed.data.search, p_after: parsed.data.after,
  }).returns<SeriesCandidate[]>()
  if (response.error) throw new AppError('INTERNAL', 'admin_series_candidates failed', { cause: response.error })
  const items = response.data.slice(0, PAGE)
  return { items, next: response.data.length > PAGE ? items[PAGE - 1].id : null }
}

export async function listAdminSeriesPage(db: SupabaseClient, cursor: { order: number; id: string } | null, search: string) {
  const query = db.from('template_series').select('id,name_zh,slug,is_active,show_members,sort_order')
    .order('sort_order').order('id').limit(PAGE + 1)
  if (search) query.ilike('name_zh', '%' + search.replace(/[\\%_]/g, char => '\\' + char) + '%')
  if (cursor) query.or(`sort_order.gt.${cursor.order},and(sort_order.eq.${cursor.order},id.gt.${cursor.id})`)
  const { data, error } = await query.returns<Array<{
    id: string; name_zh: string; slug: string; is_active: boolean; show_members: boolean; sort_order: number
  }>>()
  if (error) throw new AppError('INTERNAL', 'list series failed', { cause: error })
  return { items: data.slice(0, PAGE), hasNext: data.length > PAGE }
}

export async function listAdminSeriesOptions(db: SupabaseClient): Promise<{ id: string; nameZh: string }[]> {
  const options: { id: string; nameZh: string }[] = []
  for (;;) {
    const query = db.from('template_series').select('id,nameZh:name_zh').order('id').limit(250)
    const last = options.at(-1)
    if (last) query.gt('id', last.id)
    const { data, error } = await query.returns<typeof options>()
    if (error) throw new AppError('INTERNAL', 'list series options failed', { cause: error })
    options.push(...data)
    if (data.length < 250) return options.sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh') || a.id.localeCompare(b.id))
  }
}
