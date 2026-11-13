import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { idsSchema, type BulkTaskOutcome } from '../templates/bulk-task-rules'
import { seriesCopy as copy } from './copy'
import { getAdminSeries } from './repository'
import { nextMembers, type Membership } from './bulk-membership-rules'
import type { SeriesDetail } from './types'

// 批量加入系列 / 移出系列 (Owner 2026-11-14) from the template list. Each series the batch touches
// is saved once through admin_save_template_series, the function 系列管理 saves with (series lock,
// revision check, member rules), with its own fields unchanged and only the member list edited.
// Joining moves a template out of the series it was in first, as moving it by hand would.

const inputSchema = z.object({ ids: idsSchema, seriesId: z.uuid().nullable() })

const FIELDS = ['slug', 'name_en', 'name_zh', 'description_en', 'description_zh', 'cover_url', 'category_key', 'sort_order', 'is_active', 'show_members'] as const

const SAVE_ERRORS: Record<string, string> = {
  SERIES_CHANGED: copy.changed, INVALID_SERIES_MEMBERS: copy.invalidMembers, SERIES_MEMBER_TAKEN: copy.memberTaken,
}

async function rewriteMembers(db: SupabaseClient, actor: string, series: SeriesDetail, members: string[]) {
  const fields = Object.fromEntries(FIELDS.map(key => [key, series[key]]))
  const { error } = await db.rpc('admin_save_template_series', {
    p_id: series.id, p_revision: series.revision, p_fields: fields, p_members: members, p_actor: actor, p_reason: null,
  })
  if (!error) return logger.info('admin.series.saved', { adminId: actor, seriesId: series.id, memberCount: members.length, bulk: true })
  if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
  if (error.message === 'TEMPLATE_DELETED') throw new AppError('INVALID_INPUT', '已删除的模板不能加入系列')
  throw SAVE_ERRORS[error.message] ? new AppError('INVALID_INPUT', `「${series.name_zh}」：${SAVE_ERRORS[error.message]}`)
    : new AppError('INTERNAL', 'admin_save_template_series failed', { cause: error })
}

async function readMembership(db: SupabaseClient, ids: string[]): Promise<Membership[]> {
  const { data, error } = await db.from('templates').select('id,seriesId:series_id').in('id', ids).returns<Membership[]>()
  if (error) throw new AppError('INTERNAL', 'read template series failed', { cause: error })
  return data
}

async function detailOf(db: SupabaseClient, id: string): Promise<SeriesDetail> {
  const series = await getAdminSeries(db, id)
  if (!series) throw new AppError('INVALID_INPUT', '这个系列已不存在，请刷新页面')
  return series
}

export async function setTemplatesSeries(db: SupabaseClient, actor: string, input: unknown): Promise<BulkTaskOutcome> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.batchInvalid)
  const { ids, seriesId } = parsed.data
  const rows = await readMembership(db, ids)
  const found = new Set(rows.map(row => row.id))
  const skipped = ids.filter(id => !found.has(id)).map(id => ({ id, reason: '模板已不存在' }))
  const leaving = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row.seriesId || row.seriesId === seriesId) continue
    leaving.set(row.seriesId, (leaving.get(row.seriesId) ?? new Set()).add(row.id))
  }
  for (const [from, out] of leaving) {
    const series = await detailOf(db, from)
    await rewriteMembers(db, actor, series, series.members.map(member => member.id).filter(id => !out.has(id)))
  }
  const moving = rows.map(row => row.id)
  if (seriesId) {
    const target = await detailOf(db, seriesId)
    const members = nextMembers(target.members.map(member => member.id), moving)
    if (members) await rewriteMembers(db, actor, target, members)
  }
  return { done: ids.filter(id => found.has(id)), skipped }
}
