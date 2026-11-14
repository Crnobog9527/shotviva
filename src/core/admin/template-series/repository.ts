import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { seriesCopy as copy } from './copy'
import type { CandidatePage, SeriesDetail } from './types'
import { saveSeriesSchema, searchSchema, seriesCandidatesSchema, seriesDetailSchema } from './validation'

const PAGE = 30
const MESSAGES: Record<string, string> = {
  INVALID_SERIES_CATEGORY: copy.invalidCategory, SERIES_CHANGED: copy.changed,
  INVALID_SERIES_MEMBERS: copy.invalidMembers, SERIES_MEMBER_TAKEN: copy.memberTaken,
  SERIES_REASON_REQUIRED: copy.reason,
}

export async function saveAdminSeries(db: SupabaseClient, actor: string, input: unknown): Promise<string> {
  const parsed = saveSeriesSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.invalid)
  const { id, revision, fields, members, reason } = parsed.data
  const { data, error } = await db.rpc('admin_save_template_series', {
    p_id: id, p_revision: revision, p_fields: fields, p_members: members, p_actor: actor, p_reason: reason,
  })
  if (error) {
    if (error.code === '23505') throw new AppError('INVALID_INPUT', copy.slugTaken)
    if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
    if (MESSAGES[error.message]) throw new AppError('INVALID_INPUT', MESSAGES[error.message])
    throw new AppError('INTERNAL', 'admin_save_template_series failed', { cause: error })
  }
  if (typeof data !== 'string' || !data) throw new AppError('INTERNAL', 'missing saved series id')
  logger.info('admin.series.saved', { adminId: actor, seriesId: data, active: fields.is_active, memberCount: members.length, reason })
  return data
}

export async function getAdminSeries(db: SupabaseClient, id: string): Promise<SeriesDetail | null> {
  const { data, error } = await db.rpc('admin_template_series_detail', { p_id: id })
  if (error) throw new AppError('INTERNAL', 'admin_template_series_detail failed', { cause: error })
  return seriesDetailSchema.nullable().parse(data)
}

export async function searchSeriesCandidates(db: SupabaseClient, search: unknown, after: unknown): Promise<CandidatePage> {
  const parsed = searchSchema.safeParse({ search, after })
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.search)
  const response = await db.rpc('admin_series_candidates', {
    p_search: parsed.data.search, p_after: parsed.data.after,
  })
  if (response.error) throw new AppError('INTERNAL', 'admin_series_candidates failed', { cause: response.error })
  const rows = seriesCandidatesSchema.parse(response.data)
  const items = rows.slice(0, PAGE)
  return { items, next: rows.length > PAGE ? items[PAGE - 1].id : null }
}

export async function listAdminSeriesOptions(db: SupabaseClient): Promise<{ id: string; nameZh: string; nameEn: string }[]> {
  const options: { id: string; nameZh: string; nameEn: string }[] = []
  for (;;) {
    const query = db.from('template_series').select('id,nameZh:name_zh,nameEn:name_en').is('deleted_at', null).order('id').limit(250)
    const last = options.at(-1)
    if (last) query.gt('id', last.id)
    const { data, error } = await query.returns<typeof options>()
    if (error) throw new AppError('INTERNAL', 'list series options failed', { cause: error })
    options.push(...data)
    if (data.length < 250) return options.sort((a, b) => a.nameZh.localeCompare(b.nameZh, 'zh') || a.id.localeCompare(b.id))
  }
}
