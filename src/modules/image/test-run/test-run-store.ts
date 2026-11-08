import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '@/core/billing'
import { AppError } from '@/core/errors'
import type { JobCost } from '@/core/jobs'
import type { Resolution } from '@/core/templates'

import {
  TEST_RUN_COLUMNS,
  testBudgetSchema,
  testPhotoRowSchema,
  testRunRowSchema,
  type TestBudget,
  type TestPhoto,
  type TestRun,
} from './test-run-row'

// Database side of admin test runs (ARCHITECTURE §10.b, T85). Service-role client only: both tables
// refuse every client role. Writes go through the 0783–0786 functions; reads are plain selects on
// the tables' indexes: (template_id, created_at desc) for the panel, last_used_at for photos.

export const TEST_RUN_LIST_LIMIT = 50
export const RECENT_PHOTOS_LIMIT = 12

function readFailed(what: string, error: { message: string }): never {
  throw new AppError('INTERNAL', `${what} failed`, { cause: new Error(error.message) })
}

export type BeginTestRun = {
  actorId: string
  runId: string
  templateId: string
  kind: TestRun['kind']
  parentId: string | null
  photoId: string | null
  batchId: string
  resolution: Resolution
  inputs: Record<string, unknown>
  promptVersion: number
  provider: string
  estimateUsd: number
}

// Over today's budget raises TEST_BUDGET_EXCEEDED before anything is written (0783).
export function beginTestRun(db: SupabaseClient, run: BeginTestRun): Promise<TestRun> {
  return callRpc(
    db,
    'admin_begin_test_run',
    {
      p_actor: run.actorId,
      p_run_id: run.runId,
      p_template_id: run.templateId,
      p_kind: run.kind,
      p_parent_id: run.parentId,
      p_photo_id: run.photoId,
      p_batch_id: run.batchId,
      p_resolution: run.resolution,
      p_inputs: run.inputs,
      p_prompt_version: run.promptVersion,
      p_provider: run.provider,
      p_estimate_usd: run.estimateUsd,
    },
    testRunRowSchema,
  )
}

export type FinishTestRun = { runId: string; status: 'succeeded' | 'failed'; outputKey?: string; errorCode?: string; durationMs: number } & JobCost

export function finishTestRun(db: SupabaseClient, finish: FinishTestRun): Promise<TestRun> {
  return callRpc(
    db,
    'admin_finish_test_run',
    {
      p_run_id: finish.runId,
      p_status: finish.status,
      p_output_key: finish.outputKey ?? null,
      p_error_code: finish.errorCode ?? null,
      p_provider_usage: finish.usage ?? null,
      p_cost_usd: finish.costUsd ?? null,
      p_duration_ms: Math.max(0, Math.round(finish.durationMs)),
    },
    testRunRowSchema,
  )
}

export async function findTestRun(db: SupabaseClient, runId: string): Promise<TestRun | null> {
  const { data, error } = await db.from('admin_test_runs').select(TEST_RUN_COLUMNS).eq('id', runId).maybeSingle()
  if (error) readFailed('admin_test_runs read', error)
  return data ? testRunRowSchema.parse(data) : null
}

// The panel's tree: a template's newest 50 runs (the cleanup keeps no more, covers aside).
export async function listTestRuns(db: SupabaseClient, templateId: string): Promise<TestRun[]> {
  const { data, error } = await db
    .from('admin_test_runs')
    .select(TEST_RUN_COLUMNS)
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
    .limit(TEST_RUN_LIST_LIMIT)
  if (error) readFailed('admin_test_runs list', error)
  return z.array(testRunRowSchema).parse(data)
}

export async function findTestPhoto(db: SupabaseClient, photoId: string): Promise<TestPhoto | null> {
  const { data, error } = await db.from('admin_test_photos').select('id, object_key, last_used_at').eq('id', photoId).maybeSingle()
  if (error) readFailed('admin_test_photos read', error)
  return data ? testPhotoRowSchema.parse(data) : null
}

// The photos a set of runs started from, plus the most recently used ones, for the panel.
export async function listTestPhotos(db: SupabaseClient, ids: readonly string[]): Promise<{ recent: TestPhoto[]; used: TestPhoto[] }> {
  const columns = 'id, object_key, last_used_at'
  const [recent, used] = await Promise.all([
    db.from('admin_test_photos').select(columns).order('last_used_at', { ascending: false }).limit(RECENT_PHOTOS_LIMIT),
    ids.length > 0 ? db.from('admin_test_photos').select(columns).in('id', [...ids]) : Promise.resolve({ data: [], error: null }),
  ])
  if (recent.error) readFailed('admin_test_photos recent', recent.error)
  if (used.error) readFailed('admin_test_photos used', used.error)
  return { recent: z.array(testPhotoRowSchema).parse(recent.data), used: z.array(testPhotoRowSchema).parse(used.data) }
}

export async function insertTestPhoto(db: SupabaseClient, photo: { id: string; objectKey: string; actorId: string }): Promise<TestPhoto> {
  const { data, error } = await db
    .from('admin_test_photos')
    .upsert({ id: photo.id, object_key: photo.objectKey, created_by: photo.actorId }, { onConflict: 'id' })
    .select('id, object_key, last_used_at')
    .single()
  if (error) readFailed('admin_test_photos insert', error)
  return testPhotoRowSchema.parse(data)
}

export function loadTestBudget(db: SupabaseClient): Promise<TestBudget> {
  return callRpc(db, 'admin_test_budget_status', {}, testBudgetSchema)
}

// The R2 keys of what the cleanup deleted (0785), for the caller to remove.
export function cleanupTestRuns(db: SupabaseClient, actorId: string): Promise<string[]> {
  return callRpc(db, 'admin_cleanup_test_runs', { p_actor: actorId }, z.object({ keys: z.array(z.string()) }).transform((row) => row.keys))
}

export function markTestRunCover(db: SupabaseClient, input: { actorId: string; runId: string; beforeUrl: string | null; afterUrl: string }): Promise<string> {
  return callRpc(
    db,
    'admin_set_test_run_cover',
    // p_locale null: the common cover (every language without its own); per-language covers: T87.
    { p_actor: input.actorId, p_run_id: input.runId, p_before_url: input.beforeUrl, p_after_url: input.afterUrl, p_locale: null },
    z.string(),
  )
}

export function saveTestBudget(db: SupabaseClient, actorId: string, budgetUsd: number): Promise<unknown> {
  return callRpc(db, 'admin_set_system_setting', { p_key: 'admin_test_daily_budget_usd', p_value: budgetUsd, p_actor: actorId }, z.unknown())
}
