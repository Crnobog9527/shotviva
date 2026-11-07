import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { toRpcError } from '@/core/billing'

import { friendly, parse, reasonSchema } from './commands'
import { BATCH_MAX, type BatchOutcome } from './list-types'

// Batch actions on the /admin/users list (ARCHITECTURE §10.a, T77): one SQL function call each,
// one transaction, all or nothing (0621, 0622). When the batch is refused because of particular
// users (an account gone, a pool that would drop below zero) the outcome names them, so the
// dialog can list them by email; any other failure is an error. `actorId` is the signed-in admin
// (requireAdmin); the SQL function checks the role again and records who did it.

const userIds = z.array(z.uuid()).min(1).max(BATCH_MAX).refine((ids) => new Set(ids).size === ids.length)

const adjustSchema = z.object({
  userIds,
  pool: z.enum(['free', 'paid']),
  amount: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 100_000),
  reason: reasonSchema,
  // From the dialog, one per opening, so a double submit is one batch.
  batchKey: z.uuid(),
})

const banSchema = z.object({ userIds, banned: z.boolean(), reason: reasonSchema })

const REJECTIONS: Record<string, Extract<BatchOutcome, { kind: 'rejected' }>['reason']> = {
  PROFILE_NOT_FOUND: 'missing',
  CREDITS_INSUFFICIENT: 'insufficient',
  // A ban that would hit an admin or the acting admin (0622).
  PROTECTED_USER: 'protected',
}

const ids = (details: unknown): string[] => (typeof details === 'string' ? details.split(',').filter((id) => z.uuid().safeParse(id).success) : [])

async function callBatch(db: SupabaseClient, fn: string, args: Record<string, unknown>, done: (data: unknown) => BatchOutcome): Promise<BatchOutcome> {
  const { data, error } = await db.rpc(fn, args)
  if (!error) return done(data)
  const rejection = REJECTIONS[error.message]
  if (rejection) return { kind: 'rejected', reason: rejection, userIds: ids(error.details) }
  return friendly(toRpcError(fn, error))
}

const adjustResult = z.object({ applied: z.number().int(), repeated: z.number().int() })
const banResult = z.object({ changed: z.number().int(), unchanged: z.number().int() })

export async function batchAdjustCredits(db: SupabaseClient, actorId: string, input: unknown): Promise<BatchOutcome> {
  const args = parse(adjustSchema, input)
  return callBatch(
    db,
    'admin_batch_adjust_credits',
    { p_actor: actorId, p_user_ids: args.userIds, p_pool: args.pool, p_amount: args.amount, p_reason: args.reason, p_batch_key: args.batchKey },
    (data) => {
      const result = adjustResult.parse(data)
      return { kind: 'done', changed: result.applied, unchanged: result.repeated }
    },
  )
}

export async function batchSetBanned(db: SupabaseClient, actorId: string, input: unknown): Promise<BatchOutcome> {
  const args = parse(banSchema, input)
  return callBatch(db, 'admin_batch_set_banned', { p_actor: actorId, p_user_ids: args.userIds, p_banned: args.banned, p_reason: args.reason }, (data) => ({
    kind: 'done',
    ...banResult.parse(data),
  }))
}
