import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AppError } from '@/core/errors'
import type { ObjectStore } from '@/core/storage'
import { thumbnailKey } from './test-thumbnail'

const args = z.object({
  kind: z.enum(['photo', 'run']),
  template: z.string().min(1).max(64).optional(),
  date: z.iso.datetime({ offset: true }).optional(),
  id: z.uuid().optional(),
})
const assetRow = z.object({ id: z.uuid(), date: z.string(), key: z.string().nullable(), label: z.string().nullable().optional() })
const PAGE_SIZE = 30

function pageArgs(params: unknown) {
  const parsed = args.safeParse(params)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '无效的列表参数')
  const { kind, template, date, id } = parsed.data
  if (!!date !== !!id || (kind === 'run' && !template)) throw new AppError('INVALID_INPUT', '无效的列表参数')
  return parsed.data
}

export async function listManagedAssets(db: SupabaseClient, store: ObjectStore, params: unknown) {
  const { kind, template, date, id } = pageArgs(params)
  const timestamp = kind === 'photo' ? 'last_used_at' : 'created_at'
  let query = kind === 'photo'
    ? db.from('admin_test_photos').select('id,date:last_used_at,key:object_key')
    : db.from('admin_test_runs').select('id,date:created_at,key:output_key,label:provider').eq('template_id', template!).neq('status','running')
  if (date && id) query = query.or(`${timestamp}.lt.${date},and(${timestamp}.eq.${date},id.lt.${id})`)
  const { data, error } = await query.order(timestamp, { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
  if (error) throw new AppError('INTERNAL', '读取列表失败', { cause: error })
  const rows = z.array(assetRow).parse(data)
  const items = await Promise.all(rows.slice(0, PAGE_SIZE).map(async row => {
    const [thumbnail, originalUrl] = row.key ? await Promise.all([
      store.presignGet(thumbnailKey(row.key), { expiresInSeconds: 600 }),
      store.presignGet(row.key, { expiresInSeconds: 600 }),
    ]) : [null, null]
    return { id: row.id, date: row.date, label: row.label, thumbnail, originalUrl }
  }))
  const last = items.at(-1)
  return { items, next: rows.length > PAGE_SIZE && last ? { date: last.date, id: last.id } : null }
}
