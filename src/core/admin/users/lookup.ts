import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

// The lookup box (ARCHITECTURE §10「万能查找」): admin_lookup (0182) routes the query by its
// shape over unique indexes and answers at most one user. No hit means "show the email list".

export type LookupKind = 'user' | 'job' | 'checkout' | 'invoice' | 'charge' | 'subscription' | 'waffo' | 'email'

export type LookupHit = { kind: LookupKind; userId: string; jobId: string | null }

const rowSchema = z.object({
  kind: z.enum(['user', 'job', 'checkout', 'invoice', 'charge', 'subscription', 'waffo', 'email']),
  user_id: z.uuid(),
  job_id: z.uuid().nullable(),
})

export async function lookupUser(db: SupabaseClient, query: string): Promise<LookupHit | null> {
  const q = query.trim()
  if (q.length === 0) return null
  const { data, error } = await db.rpc('admin_lookup', { p_query: q })
  if (error) throw new AppError('INTERNAL', 'admin lookup failed', { cause: new Error(error.message) })
  // A Waffo subscription order (ORD_…) matches one payments row per charge (T50), all the same
  // user; every other kind of query matches at most one row.
  const row = rowSchema.array().parse(data)[0]
  return row ? { kind: row.kind, userId: row.user_id, jobId: row.job_id } : null
}

// Where a hit lands: the user's detail, with the job highlighted when the query was a job id.
export function lookupHref(hit: LookupHit): string {
  return hit.jobId ? `/admin/users/${hit.userId}?job=${hit.jobId}` : `/admin/users/${hit.userId}`
}
