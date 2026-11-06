import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { adminAdjustCredits } from '@/core/billing'
import { AppError } from '@/core/errors'

// "补偿这一单" (ARCHITECTURE §10, T25): give back what one succeeded job cost, into the pool
// it was charged from, through admin_adjust_credits. The idempotency key is fixed per job, so
// a second click (or a second admin tab) is a no-op instead of a second payout. The job is read
// by primary key first because cost, pool and owner must come from the database, never from
// the browser; the write itself is still one SQL function.

export const compensationKey = (jobId: string) => `comp:${jobId}`

export const COMPENSATE_ERRORS = {
  notFound: '任务不存在。',
  notSucceeded: '只有成功的任务可以补偿；失败的任务已经自动退回。',
} as const

const jobSchema = z.object({
  user_id: z.uuid(),
  status: z.enum(['running', 'succeeded', 'failed']),
  credits_cost: z.number().int().positive(),
  credit_pool: z.enum(['free', 'paid']),
})

export type Compensation = { applied: boolean; credits: number; pool: 'free' | 'paid' }

export async function compensateJob(db: SupabaseClient, jobId: unknown): Promise<Compensation> {
  const id = z.uuid().safeParse(jobId)
  if (!id.success) throw new AppError('INVALID_INPUT', COMPENSATE_ERRORS.notFound)
  const { data, error } = await db
    .from('generation_jobs')
    .select('user_id, status, credits_cost, credit_pool')
    .eq('id', id.data)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', 'compensate read failed', { cause: new Error(error.message) })
  if (!data) throw new AppError('NOT_FOUND', COMPENSATE_ERRORS.notFound)
  const job = jobSchema.parse(data)
  if (job.status !== 'succeeded') throw new AppError('CONFLICT', COMPENSATE_ERRORS.notSucceeded)
  const change = await adminAdjustCredits(db, {
    userId: job.user_id,
    amount: job.credits_cost,
    reason: `补偿 job ${id.data}`,
    pool: job.credit_pool,
    idempotencyKey: compensationKey(id.data),
  })
  return { applied: change.applied, credits: job.credits_cost, pool: job.credit_pool }
}
