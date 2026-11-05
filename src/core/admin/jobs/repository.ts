import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { modelFromTag } from '@/core/jobs'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { beijingDayStart, type JobFilters } from './filters'

// All generation jobs, newest first (ARCHITECTURE §10). Index generation_jobs_created_at_id_idx
// (0160) drives the order, the keyset and the date range; status / template / source / model
// are filters on that walk. Only list columns are read: inputs is a jsonb, so just its
// resolution key is selected.

const COLUMNS = 'id, created_at, finished_at, user_id, template_id, status, source, provider, credit_pool, credits_cost, error_code, resolution:inputs->>resolution'

const rowSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  user_id: z.uuid(),
  template_id: z.string(),
  status: z.enum(['running', 'succeeded', 'failed']),
  source: z.enum(['web', 'graylum']),
  provider: z.string().nullable(),
  credit_pool: z.enum(['free', 'paid']),
  credits_cost: z.number(),
  error_code: z.string().nullable(),
  resolution: z.string().nullable(),
})

export type AdminJob = {
  id: string
  createdAt: string
  durationMs: number | null
  userId: string
  templateId: string
  status: 'running' | 'succeeded' | 'failed'
  source: 'web' | 'graylum'
  model: string
  resolution: string
  creditPool: 'free' | 'paid'
  creditsCost: number
  errorCode: string | null
}

function toJob(row: z.infer<typeof rowSchema>): AdminJob {
  return {
    id: row.id,
    createdAt: row.created_at,
    durationMs: row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.created_at) : null,
    userId: row.user_id,
    templateId: row.template_id,
    status: row.status,
    source: row.source,
    model: modelFromTag(row.provider) ?? row.provider ?? '—',
    // Pre-T16 jobs carry no resolution and were all 1K.
    resolution: row.resolution ?? '1k',
    creditPool: row.credit_pool,
    creditsCost: row.credits_cost,
    errorCode: row.error_code,
  }
}

export async function listJobs(db: SupabaseClient, filters: JobFilters): Promise<Page<AdminJob>> {
  let query = db
    .from('generation_jobs')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.template) query = query.eq('template_id', filters.template)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.model) query = query.like('provider', `%/${filters.model}`)
  if (filters.from) query = query.gte('created_at', beijingDayStart(filters.from))
  if (filters.to) query = query.lt('created_at', beijingDayStart(filters.to, 1))
  const after = decodeCursor(filters.cursor)
  if (after) query = query.or(afterCursor(after))
  const { data, error } = await query
  if (error) throw new AppError('INTERNAL', 'generation_jobs list failed', { cause: new Error(error.message) })
  return toPage(rowSchema.array().parse(data), toJob)
}

// Filter dropdown: every template id and name. A handful of rows.
export async function listTemplateOptions(db: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from('templates').select('id, name').order('sort_order').order('id')
  if (error) throw new AppError('INTERNAL', 'templates options failed', { cause: new Error(error.message) })
  return z.array(z.object({ id: z.string(), name: z.string() })).parse(data)
}
