import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { apiKeySchema } from '@/core/providers'

import { setAdminKey, setCostsProject } from './repository'

// Saving /admin/costs settings (T33). The key is write-only: blank keeps the stored one, and it
// is never logged or sent back. The project id is plain text; blank clears the filter.

const blankAsUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export const costSettingsSchema = z.object({
  apiKey: z.preprocess(blankAsUndefined, apiKeySchema.optional()),
  projectId: z.preprocess(blankAsUndefined, z.string().regex(/^proj_[A-Za-z0-9]{1,64}$/).optional()),
})

export type CostSettingsInput = z.input<typeof costSettingsSchema>

export async function saveCostSettings(db: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const parsed = costSettingsSchema.safeParse(input)
  if (!parsed.success) {
    // Field names only: an invalid key must not reach a log or the page.
    const keyIssue = parsed.error.issues.some((issue) => issue.path[0] === 'apiKey')
    throw new AppError('INVALID_INPUT', keyIssue ? '密钥格式不对：16～1024 个字符，不能有空格或换行' : '项目 ID 格式不对，应形如 proj_abc123')
  }
  if (parsed.data.apiKey) await setAdminKey(db, parsed.data.apiKey)
  await setCostsProject(db, parsed.data.projectId ?? null)
  logger.info('admin.costs.settings_saved', { adminId, keyChanged: Boolean(parsed.data.apiKey), projectFilter: Boolean(parsed.data.projectId) })
}

export async function clearCostSettings(db: SupabaseClient, adminId: string): Promise<void> {
  await setAdminKey(db, null)
  logger.info('admin.costs.key_cleared', { adminId })
}
