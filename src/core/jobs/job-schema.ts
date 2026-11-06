import { z } from 'zod'

import { CREDIT_POOLS, type CreditPool } from '../billing/pools'

// Mirrors public.generation_jobs (supabase/migrations/0022_generation_jobs.sql, 0140_credit_pools.sql).
export const JOB_MODULES = ['image', 'video'] as const
export const JOB_SOURCES = ['web', 'graylum'] as const
export const JOB_STATUSES = ['running', 'succeeded', 'failed'] as const
export const JOB_VISIBILITIES = ['public', 'private'] as const

export type JobModule = (typeof JOB_MODULES)[number]
export type JobSource = (typeof JOB_SOURCES)[number]
export type JobStatus = (typeof JOB_STATUSES)[number]
export type JobVisibility = (typeof JOB_VISIBILITIES)[number]

export type Job = {
  id: string
  userId: string
  module: JobModule
  templateId: string
  // The work this one was edited from (ARCHITECTURE §5.2); null for a template generation.
  parentJobId: string | null
  inputs: Record<string, unknown>
  provider: string | null
  source: JobSource
  idempotencyKey: string | null
  status: JobStatus
  // Pool the job was charged from; decides watermark and whether it may be private.
  creditPool: CreditPool
  visibility: JobVisibility
  creditsCost: number
  outputKey: string | null
  errorCode: string | null
  createdAt: Date
  finishedAt: Date | null
}

const toDate = (value: string | null): Date | null => (value === null ? null : new Date(value))

export const jobRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    module: z.enum(JOB_MODULES),
    template_id: z.string(),
    // Absent on rows read before T30's migration; set null when the parent is deleted.
    parent_job_id: z.string().nullable().optional(),
    inputs: z.record(z.string(), z.unknown()),
    provider: z.string().nullable(),
    source: z.enum(JOB_SOURCES),
    idempotency_key: z.string().nullable(),
    status: z.enum(JOB_STATUSES),
    credit_pool: z.enum(CREDIT_POOLS),
    visibility: z.enum(JOB_VISIBILITIES),
    credits_cost: z.number().int().positive(),
    output_key: z.string().nullable(),
    error_code: z.string().nullable(),
    created_at: z.string(),
    finished_at: z.string().nullable(),
  })
  .transform(
    (row): Job => ({
      id: row.id,
      userId: row.user_id,
      module: row.module,
      templateId: row.template_id,
      parentJobId: row.parent_job_id ?? null,
      inputs: row.inputs,
      provider: row.provider,
      source: row.source,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      creditPool: row.credit_pool,
      visibility: row.visibility,
      creditsCost: row.credits_cost,
      outputKey: row.output_key,
      errorCode: row.error_code,
      createdAt: new Date(row.created_at),
      finishedAt: toDate(row.finished_at),
    }),
  )
