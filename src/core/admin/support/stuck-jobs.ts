import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError, toAppError } from '@/core/errors'
import { refundJob } from '@/core/jobs'

// Stuck jobs (ARCHITECTURE §10, T25): a Vercel function lives at most 300s, so a job still
// 'running' after 10 minutes is dead and its credits are still reserved. The list walks the
// partial index generation_jobs_running_created_at_idx (0180), which only holds running rows.
// Refunds go through the existing refund_job, idempotent per job: a job that settled in the
// meantime raises JOB_ALREADY_SETTLED and is left alone.

export const STUCK_AFTER_MS = 10 * 60 * 1000
// Never more than this many in one list or one "refund all"; a bigger pile is an incident.
export const STUCK_LIMIT = 100
export const STUCK_ERROR_CODE = 'STUCK_TIMEOUT'

export type StuckJob = {
  id: string
  createdAt: string
  userId: string
  templateId: string
  creditsCost: number
  creditPool: 'free' | 'paid'
  source: 'web' | 'graylum'
}

const rowSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  user_id: z.uuid(),
  template_id: z.string(),
  credits_cost: z.number(),
  credit_pool: z.enum(['free', 'paid']),
  source: z.enum(['web', 'graylum']),
})

const cutoff = (now: Date) => new Date(now.getTime() - STUCK_AFTER_MS).toISOString()

async function stuckRows(db: SupabaseClient, now: Date, jobId?: string) {
  let query = db
    .from('generation_jobs')
    .select('id, created_at, user_id, template_id, credits_cost, credit_pool, source')
    .eq('status', 'running')
    .lt('created_at', cutoff(now))
    .order('created_at', { ascending: true })
    .limit(STUCK_LIMIT)
  if (jobId) query = query.eq('id', jobId)
  const { data, error } = await query
  if (error) throw new AppError('INTERNAL', 'stuck jobs list failed', { cause: new Error(error.message) })
  return rowSchema.array().parse(data)
}

// Oldest first: the one that has waited longest is handled first.
export async function listStuckJobs(db: SupabaseClient, now = new Date()): Promise<StuckJob[]> {
  return (await stuckRows(db, now)).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    templateId: row.template_id,
    creditsCost: row.credits_cost,
    creditPool: row.credit_pool,
    source: row.source,
  }))
}

export type RefundOutcome = { refunded: number; skipped: number }

// Settled between listing and clicking: not an error for the admin, just nothing to do.
async function refundOne(db: SupabaseClient, jobId: string): Promise<boolean> {
  try {
    await refundJob(db, { jobId, errorCode: STUCK_ERROR_CODE })
    return true
  } catch (error) {
    if (toAppError(error).code === 'CONFLICT') return false
    throw error
  }
}

// jobId: one job; omitted: every stuck job (re-read here, never taken from the browser).
// Only jobs that are stuck right now qualify, so a live job under 10 minutes is never refunded.
export async function refundStuckJobs(db: SupabaseClient, jobId?: string, now = new Date()): Promise<RefundOutcome> {
  if (jobId !== undefined && !z.uuid().safeParse(jobId).success) throw new AppError('INVALID_INPUT', '任务 id 不对。')
  const rows = await stuckRows(db, now, jobId)
  const outcome: RefundOutcome = { refunded: 0, skipped: 0 }
  // One at a time: each refund locks the owner's profile, and parallel calls for the same
  // user would only queue on that lock.
  for (const row of rows) {
    if (await refundOne(db, row.id)) outcome.refunded += 1
    else outcome.skipped += 1
  }
  return outcome
}
