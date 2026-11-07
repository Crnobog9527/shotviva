import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'

// For /admin/users (ARCHITECTURE §5.1a): refusals per account over the 90 days kept and over the
// last 24 hours, for the detail's count and the list's red flag. One call for a whole page of
// accounts (admin_identity_refusal_counts, 0701, on identity_refusals_user_id_created_at_idx);
// accounts with no refusal are left out of the answer.

// Three or more refusals within 24 hours flag the account; banning stays the Owner's call.
export const REFUSAL_FLAG_24H = 3

export type RefusalCounts = { total: number; last24h: number; flagged: boolean }

const row = z.object({ user_id: z.uuid(), total: z.number().int(), last_24h: z.number().int() })

export async function identityRefusalCounts(db: SupabaseClient, userIds: readonly string[]): Promise<Map<string, RefusalCounts>> {
  if (userIds.length === 0) return new Map()
  const { data, error } = await db.rpc('admin_identity_refusal_counts', { p_user_ids: [...userIds] })
  if (error) throw new AppError('INTERNAL', 'identity refusal counts failed', { cause: new Error(error.message) })
  return new Map(
    row
      .array()
      .parse(data)
      .map((r) => [r.user_id, { total: r.total, last24h: r.last_24h, flagged: r.last_24h >= REFUSAL_FLAG_24H }]),
  )
}
