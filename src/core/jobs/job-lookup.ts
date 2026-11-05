import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '../errors'
import { jobRowSchema, type Job } from './job-schema'

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

// Service-role read scoped by owner explicitly: someone else's job is indistinguishable
// from a missing one, which is what makes the download route answer 404 to non-owners.
export async function findOwnJob(client: SupabaseClient, userId: string, jobId: string): Promise<Job | null> {
  if (!isUuid(jobId)) return null
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new AppError('INTERNAL', `findOwnJob failed: ${error.message}`)
  return data === null ? null : jobRowSchema.parse(data)
}
