import { z } from 'zod'

import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates'

// Body of POST /api/edit. job_id is client-made, as for /api/generate, so a retried request
// resolves to the same job instead of charging twice. The instruction's own rules (1–500
// characters after trimming) are checked in runEdit so the message can say which one failed.
export const editBodySchema = z.object({
  job_id: z.uuid().optional(),
  source_job_id: z.uuid(),
  instruction: z.string().max(2000),
  // Omitted means the source work's own tier.
  resolution: z.enum(RESOLUTIONS).optional(),
  // Omitted means the source work's own size; another one extends the picture to fit (T47).
  aspect_ratio: z.enum(OUTPUT_ASPECTS).optional(),
})

export type EditRequest = {
  userId: string
  jobId?: string
  sourceJobId: string
  instruction: string
  resolution?: Resolution
  aspect?: OutputAspect
  // The request's IP, stored on the job for dispute evidence (T82).
  clientIp?: string | null
}

export function toEditRequest(userId: string, body: z.infer<typeof editBodySchema>): EditRequest {
  return {
    userId,
    jobId: body.job_id,
    sourceJobId: body.source_job_id,
    instruction: body.instruction,
    resolution: body.resolution,
    aspect: body.aspect_ratio,
  }
}
