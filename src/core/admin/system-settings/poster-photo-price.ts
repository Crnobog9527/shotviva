import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import type { SystemSettingDeps } from './commands'

// 拍照识别's price per run on /admin/features (1521, ARCHITECTURE §5.3「每周复用」). The number
// lives only in each database; start_poster_photo reads the row itself. No row: the feature is off.

export async function loadPosterPhotoPrice(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.from('system_settings').select('value').eq('key', 'poster_photo_credits').maybeSingle()
  if (error) throw new AppError('INTERNAL', 'system_settings read failed', { cause: new Error(error.message) })
  const value = z.number().int().min(1).safeParse((data as { value?: unknown } | null)?.value)
  return value.success ? value.data : null
}

export const posterPhotoPriceSchema = z.object({ credits: z.number().int().min(1).max(1000) })

export async function savePosterPhotoPrice(deps: SystemSettingDeps, adminId: string, input: unknown): Promise<void> {
  const parsed = posterPhotoPriceSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '价格要是 1～1000 的整数')
  await callRpc(deps.db, 'admin_set_system_setting', { p_key: 'poster_photo_credits', p_value: parsed.data.credits, p_actor: adminId }, z.unknown())
  deps.invalidate()
  logger.info('admin.system_settings.saved', { adminId, key: 'poster_photo_credits', credits: parsed.data.credits })
}
