import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'
import { thumbnailKey } from './test-thumbnail'

type Deps = { db: SupabaseClient; store: ObjectStore }
const input = z.object({
  kind: z.enum(['photo', 'run']),
  ids: z.array(z.uuid()).min(1).max(50),
  expected: z.int().nonnegative().optional(),
})
const receipt = z.object({ count: z.int(), uses: z.int(), keys: z.array(z.string()) })

async function deleteFiles(store: ObjectStore, key: string) {
  try {
    await Promise.all([store.delete(key), store.delete(thumbnailKey(key))])
    return key
  } catch {
    logger.warn('trial asset removal deferred')
    return null
  }
}

export async function drainRemovals({ db, store }: Deps, selected?: string[]) {
  if (selected?.length === 0) return 0
  let query = db.from('admin_test_asset_removals').select('object_key').order('object_key').limit(100)
  if (selected) query = query.in('object_key', selected)
  const { data, error } = await query
  if (error) throw new AppError('INTERNAL', '读取待删除文件失败', { cause: error })
  const results = await Promise.all((data ?? []).map(row => deleteFiles(store, row.object_key)))
  const removed = results.filter(key => key !== null)
  if (removed.length) {
    const ack = await db.from('admin_test_asset_removals').delete().in('object_key', removed)
    if (ack.error) throw new AppError('INTERNAL', '记录文件清理结果失败', { cause: ack.error })
  }
  return results.length - removed.length
}

export async function removeAssets(deps: Deps, actor: string, body: unknown) {
  const parsed = input.safeParse(body)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请选择 1 到 50 个项目')
  const { kind, ids, expected } = parsed.data
  const { data, error } = await deps.db.rpc('admin_remove_test_assets', {
    p_actor: actor, p_kind: kind, p_ids: ids, p_expected: expected ?? null,
  })
  if (error) {
    if (error.message === 'FORBIDDEN') throw new AppError('FORBIDDEN', '需要管理员权限')
    if (error.message === 'PHOTO_IN_RUNNING_TEST') throw new AppError('INVALID_INPUT', '所选照片正用于试跑，请等试跑结束后再删除')
    if (error.message === 'RUNNING_TEST') throw new AppError('INVALID_INPUT', '试跑结束后才能删除记录')
    if (error.message === 'USAGE_CHANGED') throw new AppError('INVALID_INPUT', '引用情况已变化，请重新确认')
    throw new AppError('INTERNAL', '删除失败', { cause: error })
  }
  const { count, uses, keys } = receipt.parse(data)
  const pending = expected === undefined ? 0 : await drainRemovals(deps, keys)
  return { count, uses, pending }
}
