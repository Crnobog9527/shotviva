import { z } from 'zod'

import type { Job } from './job-schema'

// Whether a result is a cut-out (transparent background) comes from what its template asked the
// model for, template_prompts.model_params.background, recorded on the job at reserve time as
// inputs.background. No pixels are read per request, and the private params never leave the
// server: only the one word is kept.
const backgroundSchema = z.enum(['transparent', 'opaque', 'auto'])

export function backgroundInput(params: Record<string, unknown>): { background?: z.infer<typeof backgroundSchema> } {
  const parsed = backgroundSchema.safeParse(params.background)
  return parsed.success ? { background: parsed.data } : {}
}

// true: a cut-out, so downloads offer 白底 / 透明底. false: asked for opaque. null: unknown (the
// model chose, or the work predates the record); the browser may still find see-through pixels
// in a clean work it has loaded, and the download route honours a choice unless this is false.
export function isCutOut(job: Pick<Job, 'inputs'>): boolean | null {
  const parsed = backgroundSchema.safeParse(job.inputs.background)
  if (!parsed.success || parsed.data === 'auto') return null
  return parsed.data === 'transparent'
}
