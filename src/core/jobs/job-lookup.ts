import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { jobRowSchema, type Job } from './job-schema'

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Service-role read scoped by owner explicitly: someone else's job is indistinguishable
// from a missing one, which is what makes the download route answer 404 to non-owners. A work
// the owner deleted (T41) is missing too, for every user-facing read that goes through here.
// Primary key lookup; deleted_at is checked on the one row.
export async function findOwnJob(client: SupabaseClient, userId: string, jobId: string): Promise<Job | null> {
  if (!isUuid(jobId)) return null
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `findOwnJob failed: ${error.message}`)
  return data === null ? null : jobRowSchema.parse(data)
}

// Partner replays (ARCHITECTURE §14.4): the caller's callId finds the job it already started.
// Scoped by owner like the unique index, so one account's key never reaches another's job.
export async function findJobByIdempotencyKey(client: SupabaseClient, userId: string, key: string): Promise<Job | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `findJobByIdempotencyKey failed: ${error.message}`)
  return data === null ? null : jobRowSchema.parse(data)
}
