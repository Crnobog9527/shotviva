import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../errors'
import { JOB_REF_LENGTH, jobRef, jobRefRange } from './ref'

// Reference numbers need the service role: whether a prefix is shared is a question about every
// user's jobs. Each read is a range on generation_jobs_pkey and returns ids only.

const ids = z.array(z.object({ id: z.uuid() }))

// Enough to tell "one job" from "several"; the admin list shows the several.
const NEIGHBOUR_LIMIT = 20

function readFailed(what: string, message: string): never {
  throw new AppError('INTERNAL', `${what} failed`, { cause: new Error(message) })
}

const between = (prefix: string) => {
  const { from, to } = jobRefRange(prefix)
  return `and(id.gte.${from},id.lte.${to})`
}

// The references of a page of jobs in one round trip: every job that shares the first 8
// characters with one of them (almost always just themselves), then the shortest unique prefixes.
export async function jobRefsFor(db: SupabaseClient, jobIds: readonly string[]): Promise<Map<string, string>> {
  const refs = new Map<string, string>()
  if (jobIds.length === 0) return refs
  const prefixes = [...new Set(jobIds.map((id) => id.toLowerCase().slice(0, JOB_REF_LENGTH)))]
  const { data, error } = await db
    .from('generation_jobs')
    .select('id')
    .or(prefixes.map(between).join(','))
    .limit(jobIds.length + NEIGHBOUR_LIMIT)
  if (error) readFailed('jobRefsFor', error.message)
  const neighbours = ids.parse(data).map((row) => row.id)
  for (const id of jobIds) refs.set(id, jobRef(id, neighbours))
  return refs
}

export async function jobRefOf(db: SupabaseClient, jobId: string): Promise<string> {
  return (await jobRefsFor(db, [jobId])).get(jobId) ?? jobRef(jobId)
}

// The jobs whose id starts with `prefix` (already normalized), at most `limit`, by id.
export async function findJobIdsByRef(db: SupabaseClient, prefix: string, limit: number): Promise<{ id: string; userId: string }[]> {
  const { from, to } = jobRefRange(prefix)
  const { data, error } = await db.from('generation_jobs').select('id, user_id').gte('id', from).lte('id', to).order('id').limit(limit)
  if (error) readFailed('findJobIdsByRef', error.message)
  return z
    .array(z.object({ id: z.uuid(), user_id: z.uuid() }))
    .parse(data)
    .map((row) => ({ id: row.id, userId: row.user_id }))
}
