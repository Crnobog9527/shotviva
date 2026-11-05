import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import { JOB_MODULES, JOB_SOURCES, JOB_VISIBILITIES, jobRowSchema, type Job, type JobVisibility } from './job-schema'

// Synchronous generation settlement (ARCHITECTURE §4): reserveJob before calling the
// provider, then exactly one of confirmJob / refundJob. Each is idempotent by job id, so
// retrying any step after a network error is safe.

const reserveSchema = z.object({
  jobId: z.uuid(),
  userId: z.uuid(),
  module: z.enum(JOB_MODULES),
  templateId: z.string().min(1),
  creditsCost: z.number().int().positive(),
  source: z.enum(JOB_SOURCES),
  inputs: z.record(z.string(), z.unknown()).default({}),
  provider: z.string().min(1).nullable().default(null),
  // Partner callId; a repeat with the same key returns the first job without charging.
  idempotencyKey: z.string().min(1).nullable().default(null),
  // Applies to paid works only (default private); free works are always public.
  visibility: z.enum(JOB_VISIBILITIES).nullable().default(null),
})

export type ReserveJobInput = z.input<typeof reserveSchema>

export async function reserveJob(client: RpcClient, input: ReserveJobInput): Promise<Job> {
  const args = reserveSchema.parse(input)
  return callRpc(
    client,
    'reserve_credits',
    {
      p_job_id: args.jobId,
      p_user_id: args.userId,
      p_module: args.module,
      p_template_id: args.templateId,
      p_credits_cost: args.creditsCost,
      p_source: args.source,
      p_inputs: args.inputs,
      p_provider: args.provider,
      p_idempotency_key: args.idempotencyKey,
      p_visibility: args.visibility,
    },
    jobRowSchema,
  )
}

export async function confirmJob(
  client: RpcClient,
  input: { jobId: string; outputKey: string },
): Promise<Job> {
  const args = z.object({ jobId: z.uuid(), outputKey: z.string().min(1) }).parse(input)
  return callRpc(
    client,
    'confirm_job',
    { p_job_id: args.jobId, p_output_key: args.outputKey },
    jobRowSchema,
  )
}

export async function refundJob(
  client: RpcClient,
  input: { jobId: string; errorCode: string },
): Promise<Job> {
  const args = z.object({ jobId: z.uuid(), errorCode: z.string().min(1) }).parse(input)
  return callRpc(
    client,
    'refund_job',
    { p_job_id: args.jobId, p_error_code: args.errorCode },
    jobRowSchema,
  )
}

// The owner's public/private toggle (ARCHITECTURE §6.2): paid works switch freely, a free work
// cannot be made private (FORBIDDEN), and someone else's job is NOT_FOUND like a missing one.
export async function setJobVisibility(
  client: RpcClient,
  input: { jobId: string; userId: string; visibility: JobVisibility },
): Promise<Job> {
  const args = z.object({ jobId: z.uuid(), userId: z.uuid(), visibility: z.enum(JOB_VISIBILITIES) }).parse(input)
  return callRpc(
    client,
    'set_job_visibility',
    { p_job_id: args.jobId, p_user_id: args.userId, p_visibility: args.visibility },
    jobRowSchema,
  )
}
