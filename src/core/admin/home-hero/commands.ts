import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { HERO_CAPTION_MAX, HERO_SCENES_MAX, isHeroScope } from '@/core/templates/home-hero'

import { bundleRpcError } from '../featured-bundles/errors'

// Writes for 首页首屏大图 (migration 2007). Callers pass a service-role client and the admin's id
// after requireAdmin(); the SQL function checks the admin role again. The scope is checked here
// against the site's languages (the database only checks the shape of a language tag).

const saveSchema = z.object({
  scope: z.string().refine(isHeroScope),
  entries: z.array(z.object({
    templateId: z.string().min(1).max(100),
    // Blank: the template's own name.
    caption: z.string().trim().max(HERO_CAPTION_MAX).nullable().transform((caption) => caption || null),
  })).max(HERO_SCENES_MAX).refine((entries) => new Set(entries.map((entry) => entry.templateId)).size === entries.length),
})

const MESSAGES: Record<string, string> = {
  HERO_SIZE: `首屏大图最多放 ${HERO_SCENES_MAX} 个模板`,
  INVALID_INPUT: '只能放已上架、在网站上显示的模板，不能重复，说明不超过 60 个字',
}

export async function saveHomeHero(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', `最多 ${HERO_SCENES_MAX} 个模板且不能重复，说明不超过 ${HERO_CAPTION_MAX} 个字，请刷新页面后再试`)
  const { scope, entries } = parsed.data
  const { error } = await client.rpc('admin_set_home_hero', { p_scope: scope, p_entries: entries, p_actor: adminId })
  if (error) {
    const message = MESSAGES[error.message]
    throw message ? new AppError('INVALID_INPUT', message) : bundleRpcError(error) ?? new AppError('INTERNAL', 'rpc admin_set_home_hero failed', { cause: error })
  }
  logger.info('admin.home_hero.saved', { adminId, scope, count: entries.length })
}
