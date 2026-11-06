import { z } from 'zod'

import { RESOLUTIONS, type Resolution } from '@/core/templates'

// Body of POST /api/edit. job_id is client-made, as for /api/generate, so a retried request
// resolves to the same job instead of charging twice. The instruction's own rules (1–500
// characters after trimming) are checked in runEdit so the message can say which one failed.
export const editBodySchema = z.object({
  job_id: z.uuid().optional(),
  source_job_id: z.uuid(),
  instruction: z.string().max(2000),
  // Omitted means the source work's own tier.
  resolution: z.enum(RESOLUTIONS).optional(),
})

export type EditRequest = {
  userId: string
  jobId?: string
  sourceJobId: string
  instruction: string
  resolution?: Resolution
}

export function toEditRequest(userId: string, body: z.infer<typeof editBodySchema>): EditRequest {
  return {
    userId,
    jobId: body.job_id,
    sourceJobId: body.source_job_id,
    instruction: body.instruction,
    resolution: body.resolution,
  }
}
