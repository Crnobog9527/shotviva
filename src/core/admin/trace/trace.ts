import 'server-only'

import { randomUUID } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'
import { logger } from '../../logger'
import { prefixRange, readTrackingMark, type ObjectStore } from '../../storage'
import type { TraceMatch, TraceResult } from './types'

// 水印追查 (ARCHITECTURE §6.2, Owner 2026-11-22): an admin uploads a picture found in the wild; the
// server reads the free-work tracking mark (storage/protect) and names the work and its owner.
// The picture goes the way every admin upload does (§8.1): the browser PUTs it to a staging key,
// the server reads it once and deletes it. It is never kept.

const STILL_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_BYTES = 20 * 1024 * 1024
const stagedKey = (uploadId: string) => `uploads-admin/trace/${uploadId}`

const stageInput = z.object({ contentType: z.enum(STILL_TYPES), size: z.int().positive().max(MAX_BYTES) })
const readInput = z.object({ uploadId: z.uuidv4() })

export async function stageTrace(store: ObjectStore, input: unknown) {
  const parsed = stageInput.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '请上传不超过 20MB 的 JPEG、PNG 或 WebP 图片')
  const uploadId = randomUUID()
  const putUrl = await store.presignPut(stagedKey(uploadId), parsed.data.contentType, 300)
  return { uploadId, putUrl, headers: { 'Content-Type': parsed.data.contentType } }
}

const jobRow = z.object({
  id: z.string(),
  user_id: z.string(),
  credit_pool: z.enum(['free', 'paid']),
  template_id: z.string(),
  status: z.string(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
})

// The works whose id starts with the 48 bits read: a primary-key range, so one index read. Two
// works sharing those bits is very unlikely (2^48), but every one found is listed.
async function worksWithPrefix(db: SupabaseClient, prefix: string): Promise<TraceMatch[]> {
  const range = prefixRange(prefix)
  const { data, error } = await db
    .from('generation_jobs')
    .select('id, user_id, credit_pool, template_id, status, created_at, deleted_at')
    .gte('id', range.from)
    .lte('id', range.to)
    .limit(5)
  if (error) throw new AppError('INTERNAL', `trace lookup failed: ${error.message}`)
  const rows = z.array(jobRow).parse(data)
  return Promise.all(rows.map(async (row) => ({ ...toMatch(row), ownerEmail: await ownerEmail(db, row.user_id) })))
}

const toMatch = (row: z.infer<typeof jobRow>): Omit<TraceMatch, 'ownerEmail'> => ({
  jobId: row.id,
  userId: row.user_id,
  creditPool: row.credit_pool,
  templateId: row.template_id,
  status: row.status,
  createdAt: row.created_at,
  deleted: row.deleted_at !== null,
})

async function ownerEmail(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId)
  if (error) logger.warn('trace.owner_lookup_failed', { userId, error })
  return data.user?.email ?? null
}

async function readStaged(store: ObjectStore, key: string): Promise<Uint8Array> {
  const head = await store.head(key)
  if (!head || head.size < 1 || head.size > MAX_BYTES) throw new AppError('INVALID_INPUT', '找不到图片，请重新上传')
  return store.get(key, MAX_BYTES)
}

export async function traceUpload(deps: { db: SupabaseClient; store: ObjectStore }, input: unknown): Promise<TraceResult> {
  const parsed = readInput.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '上传编号不对')
  const key = stagedKey(parsed.data.uploadId)
  try {
    const bytes = await readStaged(deps.store, key)
    const read = await readTrackingMark(bytes).catch(() => {
      throw new AppError('INVALID_INPUT', '图片无法解码，请换一个文件')
    })
    if (!read) return { found: false }
    const works = await worksWithPrefix(deps.db, read.prefix)
    return { found: true, prefix: read.prefix, strength: read.strength, agreement: read.agreement, scale: read.scale, works }
  } finally {
    await deps.store.delete(key).catch((error: unknown) => logger.warn('trace.staged_not_deleted', { key, error }))
  }
}
