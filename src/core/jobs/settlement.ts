import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'

import type { ProviderUsage } from './provider'
import { JOB_MODULES, JOB_SOURCES, JOB_VISIBILITIES, jobRowSchema, type Job, type JobVisibility } from './job-schema'

// Synchronous generation settlement (ARCHITECTURE §4): reserveJob before calling the
// provider, then exactly one of confirmJob / refundJob. The charge is decided in the database
// from the template and inputs.resolution, never by the caller. Each is idempotent by job id, so
// retrying any step after a network error is safe.

const reserveSchema = z.object({
  jobId: z.uuid(),
  userId: z.uuid(),
  module: z.enum(JOB_MODULES),
  templateId: z.string().min(1),
  source: z.enum(JOB_SOURCES),
  inputs: z.record(z.string(), z.unknown()).default({}),
  provider: z.string().min(1).nullable().default(null),
  // Partner callId; a repeat with the same key returns the first job without charging.
  idempotencyKey: z.string().min(1).nullable().default(null),
  // Applies to paid works only (default private); free works are always public.
  visibility: z.enum(JOB_VISIBILITIES).nullable().default(null),
  // An edit (ARCHITECTURE §5.2): the caller's own succeeded work; reserve_credits checks it.
  parentJobId: z.uuid().nullable().default(null),
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
      // Ignored since T16: reserve_credits reads templates.credits_cost[inputs.resolution].
      p_credits_cost: null,
      p_source: args.source,
      p_inputs: args.inputs,
      p_provider: args.provider,
      p_idempotency_key: args.idempotencyKey,
      p_visibility: args.visibility,
      p_parent_job_id: args.parentJobId,
    },
    jobRowSchema,
  )
}

// What the provider reported using and the cost worked out from it (T33); both optional, and
// written in the same call that settles the job.
export type JobCost = { usage?: ProviderUsage | null; costUsd?: number | null }

const tokens = z.number().int().nonnegative().optional()
const costSchema = {
  usage: z
    .object({ prompt_tokens: tokens, completion_tokens: tokens, cost: z.number().nonnegative().optional(), input_text_tokens: tokens, input_image_tokens: tokens, output_tokens: tokens, decision_input_tokens: tokens, decision_output_tokens: tokens })
    .strict()
    .nullable()
    .default(null),
  costUsd: z.number().nonnegative().nullable().default(null),
}

// keptInputs: the job's uploads, already copied next to the result (T40); recorded as
// inputs.kept_inputs in this same call. confirm_job drops any key outside the job's own slot.
export async function confirmJob(client: RpcClient, input: { jobId: string; outputKey: string; keptInputs?: string[] } & JobCost): Promise<Job> {
  const args = z
    .object({ jobId: z.uuid(), outputKey: z.string().min(1), keptInputs: z.array(z.string().min(1)).max(30).default([]), ...costSchema })
    .parse(input)
  return callRpc(
    client,
    'confirm_job',
    {
      p_job_id: args.jobId,
      p_output_key: args.outputKey,
      p_provider_usage: args.usage,
      p_cost_usd: args.costUsd,
      p_kept_inputs: args.keptInputs.length > 0 ? args.keptInputs : null,
    },
    jobRowSchema,
  )
}

export async function refundJob(client: RpcClient, input: { jobId: string; errorCode: string } & JobCost): Promise<Job> {
  const args = z.object({ jobId: z.uuid(), errorCode: z.string().min(1), ...costSchema }).parse(input)
  return callRpc(
    client,
    'refund_job',
    { p_job_id: args.jobId, p_error_code: args.errorCode, p_provider_usage: args.usage, p_cost_usd: args.costUsd },
    jobRowSchema,
  )
}

// The owner deletes a finished work (T41, ARCHITECTURE §6.2「删除作品」): soft delete, credits stay
// spent. Someone else's job is NOT_FOUND like a missing one; a running one is CONFLICT; a repeat
// returns the already deleted row.
export async function deleteOwnJob(client: RpcClient, input: { jobId: string; userId: string }): Promise<Job> {
  const args = z.object({ jobId: z.uuid(), userId: z.uuid() }).parse(input)
  return callRpc(client, 'delete_own_job', { p_job_id: args.jobId, p_user_id: args.userId }, jobRowSchema)
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
