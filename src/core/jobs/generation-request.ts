import { z } from 'zod'

import { JOB_VISIBILITIES, type JobSource, type JobVisibility } from './job-schema'

// Body of POST /api/generate. job_id is optional and client-made so a retried or
// backgrounded request resolves to the same job instead of charging twice.
export const generateBodySchema = z.object({
  job_id: z.uuid().optional(),
  template_id: z.string().min(1).max(64),
  input_key: z.string().min(1).max(200).nullable().optional(),
  inputs: z
    .object({
      copy: z.record(z.string(), z.unknown()).optional(),
      aspect_ratio: z.string().max(8).optional(),
    })
    .default({}),
  visibility: z.enum(JOB_VISIBILITIES).optional(),
})

export type GenerationRequest = {
  userId: string
  source: JobSource
  jobId?: string
  templateId: string
  inputKey?: string | null
  copy?: Record<string, unknown>
  aspectRatio?: string
  // Applies to paid works only; reserve_credits forces free works public.
  visibility?: JobVisibility | null
  // Partner callId (T7); a repeat returns the first job.
  idempotencyKey?: string | null
}

export function toGenerationRequest(userId: string, body: z.infer<typeof generateBodySchema>): GenerationRequest {
  return {
    userId,
    source: 'web',
    jobId: body.job_id,
    templateId: body.template_id,
    inputKey: body.input_key ?? null,
    copy: body.inputs.copy,
    aspectRatio: body.inputs.aspect_ratio,
    visibility: body.visibility ?? null,
  }
}
