import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { seriesCopy as copy } from './copy'
import { LIVE_REASON } from './list-rules'

// 删除已下架的系列 (Owner 2026-11-14), one series or several. Each goes through
// admin_delete_template_series (1500) on its own, one after another, so each has its own
// transaction and audit row; a refusal skips that series with the reason and the rest go on.
// Deleting never deletes or unpublishes a template: the members are moved out of the series.
export type SeriesDeleteOutcome = { done: { id: string; moved: number }[]; skipped: { id: string; reason: string }[] }

export const deleteSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200).refine(ids => new Set(ids).size === ids.length),
})
const REASONS: Record<string, string> = { SERIES_LIVE: LIVE_REASON, SERIES_MISSING: '系列已不存在' }

export async function deleteAdminSeries(db: SupabaseClient, actor: string, input: unknown): Promise<SeriesDeleteOutcome> {
  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', copy.batchInvalid)
  const outcome: SeriesDeleteOutcome = { done: [], skipped: [] }
  for (const id of parsed.data.ids) {
    const { data, error } = await db.rpc('admin_delete_template_series', { p_actor: actor, p_id: id })
    if (error) {
      if (error.message === 'NOT_ADMIN') throw new AppError('FORBIDDEN', copy.forbidden)
      const reason = REASONS[error.message]
      if (!reason) throw new AppError('INTERNAL', 'admin_delete_template_series failed', { cause: error })
      outcome.skipped.push({ id, reason })
      continue
    }
    // null: someone deleted it a moment ago; nothing changed and nothing more was audited.
    if (data === null) outcome.skipped.push({ id, reason: '已经删除过' })
    else {
      const moved = z.int().nonnegative().parse(data)
      outcome.done.push({ id, moved })
      logger.info('admin.series.deleted', { adminId: actor, seriesId: id, moved })
    }
  }
  return outcome
}
