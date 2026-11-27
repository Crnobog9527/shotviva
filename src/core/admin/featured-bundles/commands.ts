import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { bundleError } from './errors'
import { BUNDLE_MAX, BUNDLE_MIN } from './types'

// Writes for 精选组合 (migration 2004). Callers pass a service-role client and the admin's id after
// requireAdmin(); the SQL functions check the admin role again.

const unique = (items: string[]) => new Set(items).size === items.length
const name = z.string().trim().min(1).max(80)
const saveSchema = z.object({
  id: z.string().uuid().nullable(),
  nameEn: name,
  nameZh: name,
  templateIds: z.array(z.string().min(1).max(100)).min(BUNDLE_MIN).max(BUNDLE_MAX).refine(unique),
})
const idsSchema = z.array(z.string().uuid()).max(100).refine(unique)

function parse<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input)
  if (!result.success) throw new AppError('INVALID_INPUT', message)
  return result.data
}

export async function saveFeaturedBundle(client: SupabaseClient, adminId: string, input: unknown): Promise<string> {
  const bundle = parse(saveSchema, input, `中英文名称都要填（80 字以内），模板选 ${BUNDLE_MIN} 到 ${BUNDLE_MAX} 个且不能重复`)
  const { data, error } = await client.rpc('admin_save_featured_bundle', {
    p_id: bundle.id, p_name_en: bundle.nameEn, p_name_zh: bundle.nameZh, p_template_ids: bundle.templateIds, p_actor: adminId,
  })
  if (error) throw bundleError('admin_save_featured_bundle', error)
  logger.info('admin.featured_bundle.saved', { adminId, bundleId: data, isNew: bundle.id === null, count: bundle.templateIds.length })
  return String(data)
}

export async function deleteFeaturedBundle(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const id = parse(z.string().uuid(), input, '这个组合已经不存在了，请刷新页面')
  const { error } = await client.rpc('admin_delete_featured_bundle', { p_id: id, p_actor: adminId })
  if (error) throw bundleError('admin_delete_featured_bundle', error)
  logger.info('admin.featured_bundle.deleted', { adminId, bundleId: id })
}

export async function setDefaultFeaturedBundles(client: SupabaseClient, adminId: string, input: unknown): Promise<void> {
  const ids = parse(idsSchema, input, '排序不完整，请刷新页面后再试')
  const { error } = await client.rpc('admin_set_featured_bundles', { p_ids: ids, p_actor: adminId })
  if (error) throw bundleError('admin_set_featured_bundles', error)
  logger.info('admin.featured_bundle.default_order', { adminId, count: ids.length })
}
