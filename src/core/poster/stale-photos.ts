import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../billing'
import { AppError } from '../errors'

// Dangling 拍照识别 runs (ARCHITECTURE §5.3「每周复用」, 1524–1525): a charged run still pending
// after 10 minutes lost its server process (a function lives at most 5) and gets its credit back.
// The cron sweeper and the admin's stuck list both use these.

export const STALE_PHOTO_MS = 10 * 60 * 1000
// One sweep or one 「全部退回」 at most; a bigger pile is an incident, the next sweep takes the rest.
export const STALE_PHOTO_LIMIT = 100

export type StalePhoto = { id: number; createdAt: string; userId: string; credits: number; creditPool: 'free' | 'paid' }
export type StaleRefund = { refunded: number; skipped: number }

const rowSchema = z.object({ id: z.number(), created_at: z.string(), user_id: z.uuid(), credits: z.number().int(), credit_pool: z.enum(['free', 'paid']) })

// Oldest first, through poster_extractions_pending_charged (1524).
export async function listStalePhotos(db: SupabaseClient, now = new Date()): Promise<StalePhoto[]> {
  const { data, error } = await db.from('poster_extractions').select('id, created_at, user_id, credits, credit_pool')
    .eq('status', 'pending').gt('credits', 0).lt('created_at', new Date(now.getTime() - STALE_PHOTO_MS).toISOString())
    .order('created_at', { ascending: true }).limit(STALE_PHOTO_LIMIT)
  if (error) throw new AppError('INTERNAL', 'stale photo list failed', { cause: new Error(error.message) })
  return rowSchema.array().parse(data).map((row) => ({ id: row.id, createdAt: row.created_at, userId: row.user_id, credits: row.credits, creditPool: row.credit_pool }))
}

const refundSchema = z.array(z.object({ refunded: z.number().int(), skipped: z.number().int() })).length(1)

// One call: the database picks the rows again (never ids from a browser) and refunds each once.
export async function refundStalePhotos(db: SupabaseClient): Promise<StaleRefund> {
  const [result] = await callRpc(db, 'refund_stale_poster_photos', { p_older_than: `${STALE_PHOTO_MS / 60000} minutes`, p_limit: STALE_PHOTO_LIMIT }, refundSchema)
  return result!
}
