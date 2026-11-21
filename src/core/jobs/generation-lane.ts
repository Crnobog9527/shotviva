import 'server-only'

import { z } from 'zod'

import type { RpcClient } from '../billing'
import { callRpc } from '../billing/rpc'
import { AppError } from '../errors'
import { logger } from '../logger'
import { modelFromTag } from './provider-tag'

// Site-wide generation lanes (queue-fairness plan Q3; SQL 1760). A request takes a slot in its
// route's lane before it reserves credits and gives it back once its job settles; a full lane is
// RATE_LIMITED with nothing reserved, which the browser treats as "queued" and resends (Q1).
export type GenerationLane = 'gpt' | 'seedream' | 'other'
export type SlotKind = 'single' | 'batch'

// From the route's provider tag (`{source}/{model}`): every GPT image model shares OpenAI's one
// images-per-minute limit, whichever line sends it; every Seedream model goes through Ark.
export function laneOf(providerId: string): GenerationLane {
  const model = (modelFromTag(providerId) ?? providerId).toLowerCase()
  if (model.includes('gpt-image')) return 'gpt'
  if (model.includes('seedream')) return 'seedream'
  return 'other'
}

export const slotKind = (batchSize: number | undefined): SlotKind => ((batchSize ?? 1) > 1 ? 'batch' : 'single')

const grantSchema = z.object({ granted: z.boolean(), reason: z.string().optional() })

export async function acquireSlot(db: RpcClient, slot: { attemptId: string; providerId: string; userId: string; kind: SlotKind }): Promise<void> {
  const lane = laneOf(slot.providerId)
  const result = await callRpc(db, 'acquire_generation_slot', {
    p_attempt_id: slot.attemptId, p_lane: lane, p_user_id: slot.userId, p_kind: slot.kind,
  }, grantSchema)
  if (result.granted) return
  logger.info('generation.lane.full', { lane, kind: slot.kind, reason: result.reason })
  throw new AppError('RATE_LIMITED', 'Many photos are being made right now; yours is queued')
}

// Never throws: a slot that could not be released lapses at its expires_at (slot_ttl_seconds).
export async function releaseSlot(db: RpcClient, attemptId: string): Promise<void> {
  try {
    await callRpc(db, 'release_generation_slot', { p_attempt_id: attemptId }, z.boolean())
  } catch (error) {
    logger.warn('generation.lane.release_failed', { attemptId, error })
  }
}

// Takes the slot, runs `work`, and always gives the slot back.
export async function withSlot<T>(db: RpcClient, slot: Parameters<typeof acquireSlot>[1], work: () => Promise<T>): Promise<T> {
  await acquireSlot(db, slot)
  try {
    return await work()
  } finally {
    await releaseSlot(db, slot.attemptId)
  }
}
