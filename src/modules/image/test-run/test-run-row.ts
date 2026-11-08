import { z } from 'zod'

import type { TestBudget } from '@/core/admin/test-runs'
import { RESOLUTIONS, type Resolution } from '@/core/templates'

// Mirrors public.admin_test_runs and admin_test_photos (supabase/migrations/0780, 0781;
// ARCHITECTURE §10.b, T85). Client-safe: the panel's types come from here too.

export type { TestBudget }

export const TEST_RUN_KINDS = ['generate', 'edit'] as const
export const TEST_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const

export type TestRun = {
  id: string
  templateId: string
  kind: (typeof TEST_RUN_KINDS)[number]
  parentId: string | null
  photoId: string | null
  batchId: string
  status: (typeof TEST_RUN_STATUSES)[number]
  resolution: Resolution
  inputs: Record<string, unknown>
  promptVersion: number | null
  provider: string | null
  costUsd: number | null
  estimateUsd: number
  outputKey: string | null
  errorCode: string | null
  durationMs: number | null
  coverSetAt: string | null
  createdAt: string
}

const money = z.coerce.number().nonnegative()

export const testRunRowSchema = z
  .object({
    id: z.string(),
    template_id: z.string(),
    kind: z.enum(TEST_RUN_KINDS),
    parent_id: z.string().nullable(),
    photo_id: z.string().nullable(),
    batch_id: z.string(),
    status: z.enum(TEST_RUN_STATUSES),
    resolution: z.enum(RESOLUTIONS),
    inputs: z.record(z.string(), z.unknown()),
    prompt_version: z.number().int().nullable(),
    provider: z.string().nullable(),
    cost_usd: money.nullable(),
    estimate_usd: money,
    output_key: z.string().nullable(),
    error_code: z.string().nullable(),
    duration_ms: z.number().int().nullable(),
    cover_set_at: z.string().nullable(),
    created_at: z.string(),
  })
  .transform(
    (row): TestRun => ({
      id: row.id,
      templateId: row.template_id,
      kind: row.kind,
      parentId: row.parent_id,
      photoId: row.photo_id,
      batchId: row.batch_id,
      status: row.status,
      resolution: row.resolution,
      inputs: row.inputs,
      promptVersion: row.prompt_version,
      provider: row.provider,
      costUsd: row.cost_usd,
      estimateUsd: row.estimate_usd,
      outputKey: row.output_key,
      errorCode: row.error_code,
      durationMs: row.duration_ms,
      coverSetAt: row.cover_set_at,
      createdAt: row.created_at,
    }),
  )

export const TEST_RUN_COLUMNS =
  'id, template_id, kind, parent_id, photo_id, batch_id, status, resolution, inputs, prompt_version, provider, cost_usd, estimate_usd, output_key, error_code, duration_ms, cover_set_at, created_at'

export type TestPhoto = { id: string; objectKey: string; lastUsedAt: string }

export const testPhotoRowSchema = z
  .object({ id: z.string(), object_key: z.string(), last_used_at: z.string() })
  .transform((row): TestPhoto => ({ id: row.id, objectKey: row.object_key, lastUsedAt: row.last_used_at }))


export const testBudgetSchema = z
  .object({ budget_usd: money, spent_usd: money, runs: z.number().int().nonnegative(), day: z.string() })
  .transform((row): TestBudget => ({ budgetUsd: row.budget_usd, spentUsd: row.spent_usd, runs: row.runs, day: row.day }))
