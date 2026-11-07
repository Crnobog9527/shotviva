import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { findJobIdsByRef, normalizeJobRef } from '@/core/jobs'

// The lookup box (ARCHITECTURE §10「万能查找」): admin_lookup (0182) routes the query by its
// shape over unique indexes and answers at most one user. No hit means "show the email list".

export type LookupKind = 'user' | 'job' | 'checkout' | 'invoice' | 'charge' | 'subscription' | 'waffo' | 'email'

// 'jobs': a reference number (T78) that several jobs start with; the jobs page lists them.
export type LookupHit = { kind: LookupKind; userId: string; jobId: string | null } | { kind: 'jobs'; ref: string }

const FULL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// A job's reference number or any 6+ character prefix of its id (ARCHITECTURE §10.a 「出图编号」):
// a range on generation_jobs_pkey, tried before admin_lookup. A full id still goes to
// admin_lookup, which checks accounts first. No job: null, and the query carries on as an email
// fragment or order number.
async function lookupJobRef(db: SupabaseClient, query: string): Promise<LookupHit | null> {
  const ref = FULL_UUID.test(query) ? null : normalizeJobRef(query)
  if (!ref) return null
  const jobs = await findJobIdsByRef(db, ref, 2)
  if (jobs.length > 1) return { kind: 'jobs', ref }
  return jobs[0] ? { kind: 'job', userId: jobs[0].userId, jobId: jobs[0].id } : null
}

const rowSchema = z.object({
  kind: z.enum(['user', 'job', 'checkout', 'invoice', 'charge', 'subscription', 'waffo', 'email']),
  user_id: z.uuid(),
  job_id: z.uuid().nullable(),
})

export async function lookupUser(db: SupabaseClient, query: string): Promise<LookupHit | null> {
  const q = query.trim()
  if (q.length === 0) return null
  const byRef = await lookupJobRef(db, q)
  if (byRef) return byRef
  const { data, error } = await db.rpc('admin_lookup', { p_query: q })
  if (error) throw new AppError('INTERNAL', 'admin lookup failed', { cause: new Error(error.message) })
  // A Waffo subscription order (ORD_…) matches one payments row per charge (T50), all the same
  // user; every other kind of query matches at most one row.
  const row = rowSchema.array().parse(data)[0]
  return row ? { kind: row.kind, userId: row.user_id, jobId: row.job_id } : null
}

// Where a hit lands: the user's detail, with the job highlighted when the query was a job id or
// reference; a reference several jobs share opens the jobs page filtered to them.
export function lookupHref(hit: LookupHit): string {
  if (hit.kind === 'jobs') return `/admin/jobs?ref=${encodeURIComponent(hit.ref)}`
  return hit.jobId ? `/admin/users/${hit.userId}?job=${hit.jobId}` : `/admin/users/${hit.userId}`
}
