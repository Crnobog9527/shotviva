import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { Job } from '@/core/jobs'
import type { PosterDiff } from '@/core/poster'
import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'

// A poster work in the Photos viewer (ARCHITECTURE §5.3): its text check, and what Redraw sends
// to make the same poster of the same set again (an ordinary job, charged like the first).
export type PosterWork = {
  status: 'pending' | 'match' | 'mismatch' | 'unchecked'
  diffs: PosterDiff[]
  redo: { templateId: string; aspect: OutputAspect; resolution: Resolution; credits: number; setId: string; part: number }
}

const posterInputs = z.object({
  poster: z.object({ set_id: z.uuid(), part: z.number().int().min(0) }),
  aspect_ratio: z.enum(OUTPUT_ASPECTS),
  resolution: z.enum(RESOLUTIONS),
})

const checkRow = z.object({ status: z.enum(['match', 'mismatch', 'unchecked']), diffs: z.array(z.object({ path: z.string(), expected: z.string(), seen: z.string() })) })

export async function loadPosterWork(admin: SupabaseClient, job: Job): Promise<PosterWork | null> {
  const inputs = posterInputs.safeParse(job.inputs)
  if (!inputs.success) return null
  const { data } = await admin.from('poster_checks').select('status, diffs').eq('job_id', job.id).maybeSingle()
  const check = checkRow.safeParse(data)
  const { poster, aspect_ratio: aspect, resolution } = inputs.data
  return {
    status: check.success ? check.data.status : 'pending',
    diffs: check.success ? check.data.diffs : [],
    redo: { templateId: job.templateId, aspect, resolution, credits: job.creditsCost, setId: poster.set_id, part: poster.part },
  }
}
