import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { CASE_STRIP_MAX } from '@/core/templates/home-case-strip'

import { bundleRpcError } from '../featured-bundles/errors'
import { DISPLAY_LOCALES } from '../locale-display/types'

// Writes for 首页「更多真实案例」 (migration 2006). Callers pass a service-role client and the
// admin's id after requireAdmin(); the SQL function checks the admin role again.

const entry = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('template'), id: z.string().min(1).max(100) }),
  // Lower case, as uuid::text compares in the function.
  z.object({ kind: z.literal('bundle'), id: z.string().uuid().transform((id) => id.toLowerCase()) }),
])
const saveSchema = z.object({
  locale: z.enum(DISPLAY_LOCALES),
  entries: z.array(entry).max(CASE_STRIP_MAX)
    .refine((entries) => new Set(entries.map((one) => `${one.kind}:${one.id}`)).size === entries.length),
})

const MESSAGES: Record<string, string> = {
  CASE_STRIP_SIZE: `「更多真实案例」最多放 ${CASE_STRIP_MAX} 项`,
  INVALID_INPUT: '只能放已上架、在网站上显示的模板或已有的组合，而且不能重复',
}

export async function saveHomeCaseStrip(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', `最多 ${CASE_STRIP_MAX} 项，模板和组合都不能重复，请刷新页面后再试`)
  const { locale, entries } = parsed.data
  const { error } = await client.rpc('admin_set_home_case_strip', { p_locale: locale, p_entries: entries, p_actor: adminId })
  if (error) {
    const message = MESSAGES[error.message]
    throw message ? new AppError('INVALID_INPUT', message) : bundleRpcError(error) ?? new AppError('INTERNAL', 'rpc admin_set_home_case_strip failed', { cause: error })
  }
  logger.info('admin.home_case_strip.saved', { adminId, locale, count: entries.length })
}
