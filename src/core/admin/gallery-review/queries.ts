import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { publicCopy } from '@/core/gallery/public-copy'
import type { ObjectStore } from '@/core/storage'

import { afterFilter, decodeCursor, encodeCursor } from './cursor'
import type { ReviewPage, ReviewTab, ReviewWork } from './types'

// /admin/gallery (ARCHITECTURE §9 第 5 条). Service role only. Every list is the gallery's scope
// (§9 第 7 条: web works, no freeform) and reads one partial index: the queue
// (generation_jobs_moderation_queue_idx), the decided tabs (generation_jobs_moderated_idx), the
// reported tab (work_reports_open_idx). Thumbnails are public works, signed for 10 minutes.

export const REVIEW_PAGE_SIZE = 30
const REPORTED_LIMIT = 200
const IMAGE_SECONDS = 600

const COLUMNS =
  'id, template_id, created_at, credit_pool, moderation_status, moderation_reason, moderation_categories, ' +
  'auto_moderated_at, moderated_at, output_key, parent_job_id, inputs, templates(name)'

const rowSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  created_at: z.string(),
  credit_pool: z.enum(['free', 'paid']),
  moderation_status: z.enum(['pending', 'approved', 'rejected']),
  moderation_reason: z.string().nullable(),
  moderation_categories: z.array(z.string()),
  auto_moderated_at: z.string().nullable(),
  moderated_at: z.string().nullable(),
  output_key: z.string().nullable(),
  parent_job_id: z.string().nullable(),
  inputs: z.record(z.string(), z.unknown()),
  templates: z.object({ name: z.string() }).nullable(),
})
type Row = z.infer<typeof rowSchema>

type Deps = { db: SupabaseClient; store: Pick<ObjectStore, 'presignGet'> }

function failed(what: string, message: string): never {
  throw new AppError('INTERNAL', `gallery review ${what} failed`, { cause: new Error(message) })
}

function inScope(db: SupabaseClient) {
  return db
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
}

async function readRows(tab: Exclude<ReviewTab, 'reported'>, db: SupabaseClient, rawCursor: string | null): Promise<Row[]> {
  const cursor = decodeCursor(rawCursor)
  const pending = tab === 'pending'
  const column = pending ? 'created_at' : 'moderated_at'
  let query = inScope(db).eq('moderation_status', tab)
  if (!pending) query = query.not('moderated_at', 'is', null)
  if (cursor) query = query.or(afterFilter(column, cursor, pending))
  const { data, error } = await query
    .order(column, { ascending: pending })
    .order('id', { ascending: pending })
    .limit(REVIEW_PAGE_SIZE)
  if (error) failed('list', error.message)
  return z.array(rowSchema).parse(data)
}

// Open reports, newest first, and the works they are about in that order.
async function readReported(db: SupabaseClient): Promise<Row[]> {
  const { data, error } = await db
    .from('work_reports')
    .select('job_id')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(REPORTED_LIMIT)
  if (error) failed('reports', error.message)
  const ids = [...new Set(z.array(z.object({ job_id: z.string() })).parse(data).map((row) => row.job_id))]
  if (ids.length === 0) return []
  const { data: jobs, error: jobsError } = await inScope(db).in('id', ids)
  if (jobsError) failed('reported works', jobsError.message)
  const byId = new Map(z.array(rowSchema).parse(jobs).map((row) => [row.id, row]))
  return ids.flatMap((id) => byId.get(id) ?? [])
}

async function openReports(db: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (ids.length === 0) return out
  const { data, error } = await db.from('work_reports').select('job_id, reason').in('job_id', ids).is('resolved_at', null)
  if (error) failed('report counts', error.message)
  for (const row of z.array(z.object({ job_id: z.string(), reason: z.string() })).parse(data)) {
    out.set(row.job_id, [...(out.get(row.job_id) ?? []), row.reason])
  }
  return out
}

async function signed(store: Deps['store'], key: string | null): Promise<string | null> {
  if (!key) return null
  return store.presignGet(key, { expiresInSeconds: IMAGE_SECONDS }).catch(() => null)
}

function toWork(row: Row, imageUrl: string | null, reasons: string[]): ReviewWork {
  return {
    id: row.id,
    imageUrl,
    templateId: row.template_id,
    templateName: row.templates?.name ?? row.template_id,
    createdAt: row.created_at,
    creditPool: row.credit_pool,
    status: row.moderation_status,
    reason: row.moderation_reason,
    categories: row.moderation_categories,
    screenedAt: row.auto_moderated_at,
    moderatedAt: row.moderated_at,
    copy: publicCopy({ parentJobId: row.parent_job_id, inputs: row.inputs }).map((field) => field.value),
    reports: { count: reasons.length, reasons: [...new Set(reasons)] },
  }
}

function nextCursor(tab: ReviewTab, rows: Row[]): string | null {
  const last = rows.at(-1)
  if (tab === 'reported' || !last || rows.length < REVIEW_PAGE_SIZE) return null
  const at = tab === 'pending' ? last.created_at : last.moderated_at
  return at ? encodeCursor({ at, id: last.id }) : null
}

export async function listReviewWorks(deps: Deps, tab: ReviewTab, cursor: string | null): Promise<ReviewPage> {
  const rows = tab === 'reported' ? await readReported(deps.db) : await readRows(tab, deps.db, cursor)
  const [reports, images] = await Promise.all([
    openReports(deps.db, rows.map((row) => row.id)),
    Promise.all(rows.map((row) => signed(deps.store, row.output_key))),
  ])
  return { tab, works: rows.map((row, i) => toWork(row, images[i] ?? null, reports.get(row.id) ?? [])), next: nextCursor(tab, rows) }
}

// The number beside 「创作库审核」 in the admin nav: works waiting for a person.
export async function pendingReviewCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'succeeded')
    .eq('visibility', 'public')
    .eq('moderation_status', 'pending')
    .is('deleted_at', null)
    .eq('source', 'web')
    .neq('template_id', 'freeform')
  if (error) failed('count', error.message)
  return count ?? 0
}
