import 'server-only'

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { logger } from '../logger'

// Decision calls run before reserve_credits, so a request that is refused, or that fails later on
// credits or the upload, leaves no job row and would escape the generation rate limit. These
// bound them per account (0703): at most JUDGE_CALLS_PER_HOUR calls an hour, and the same words
// judged in the last 10 minutes reuse that verdict instead of calling again (a batch of 30
// photos with one note calls only for the first few that run at once).

export const JUDGE_CALLS_PER_HOUR = 30

export type JudgeSlot = { status: 'call'; id: number | null } | { status: 'cached'; identitySwap: boolean } | { status: 'limited' }

const slotSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('call'), id: z.number().int() }),
  z.object({ status: z.literal('cached'), identity_swap: z.boolean() }),
  z.object({ status: z.literal('limited') }),
])

// Of the words as judged, so the database never holds them (the refusal row keeps an excerpt).
export const textHash = (text: string) => createHash('sha256').update(text.normalize('NFKC').trim()).digest('hex')

// `hash` null takes a slot without the cache (a photo edit, whose scope call has to run anyway).
// A database error lets the call go ahead: the limit protects cost, it must not stop generation.
export async function takeJudgeSlot(db: SupabaseClient, userId: string, hash: string | null): Promise<JudgeSlot> {
  const { data, error } = await db.rpc('begin_identity_judge', { p_user_id: userId, p_text_hash: hash, p_per_hour: JUDGE_CALLS_PER_HOUR })
  const parsed = slotSchema.safeParse(data)
  if (error || !parsed.success) {
    logger.warn('identity judge slot unavailable; calling anyway', { error: error ? new Error(error.message) : 'unexpected shape' })
    return { status: 'call', id: null }
  }
  const slot = parsed.data
  if (slot.status === 'cached') return { status: 'cached', identitySwap: slot.identity_swap }
  return slot.status === 'call' ? { status: 'call', id: slot.id } : slot
}

// Keeps the verdict for the 10-minute reuse. Never throws: a lost verdict only costs a call.
export async function keepVerdict(db: SupabaseClient, slot: JudgeSlot, identitySwap: boolean): Promise<void> {
  if (slot.status !== 'call' || slot.id === null) return
  const { error } = await db.rpc('finish_identity_judge', { p_id: slot.id, p_identity_swap: identitySwap })
  if (error) logger.warn('identity judge verdict not kept', { error: new Error(error.message) })
}

// Every fail-open is logged under this one message, so the logs can be counted too.
export const FAIL_OPEN_LOG = 'identity judge failed open'

// Marks a call that never answered (both attempts failed), for the fail-open count on
// /admin/providers (0705). Never throws.
export async function markJudgeFailed(db: SupabaseClient, slot: JudgeSlot): Promise<void> {
  if (slot.status !== 'call' || slot.id === null) return
  const { error } = await db.rpc('fail_identity_judge', { p_id: slot.id })
  if (error) logger.warn('identity judge failure not marked', { error: new Error(error.message) })
}
