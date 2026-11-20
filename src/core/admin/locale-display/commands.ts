import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { categoryRpcError } from '../template-categories/errors'
import { DISPLAY_LOCALES } from './types'

// Writes for the per-language display rules (migration 1575). Callers pass a service-role client
// and the admin's id after requireAdmin(); the SQL functions check the admin role again.

const locale = z.enum(DISPLAY_LOCALES)
const categoryKey = z.string().min(1).max(40)
const unique = (items: string[]) => new Set(items).size === items.length

const orderSchema = z.object({
  locale,
  parent: categoryKey.nullable(),
  keys: z.array(categoryKey).max(200).refine(unique),
})
const featuredSchema = z.object({
  locale,
  ids: z.array(z.string().min(1).max(100)).max(1000).refine(unique),
})

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new AppError('INVALID_INPUT', '排序不完整，请刷新页面后再试')
  return result.data
}

export async function setLocaleCategoryOrder(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const { locale: lang, parent, keys } = parse(orderSchema, input)
  const { error } = await client.rpc('admin_set_category_locale_order', { p_locale: lang, p_parent: parent, p_keys: keys, p_actor: adminId })
  if (error) throw categoryRpcError('admin_set_category_locale_order', error)
  logger.info('admin.locale_display.category_order', { adminId, locale: lang, parent, count: keys.length })
}

export async function setLocaleFeatured(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const { locale: lang, ids } = parse(featuredSchema, input)
  const { error } = await client.rpc('admin_set_featured_locale', { p_locale: lang, p_ids: ids, p_actor: adminId })
  if (error) throw categoryRpcError('admin_set_featured_locale', error)
  logger.info('admin.locale_display.featured', { adminId, locale: lang, count: ids.length })
}
