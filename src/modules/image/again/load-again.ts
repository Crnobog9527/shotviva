import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { findOwnJob, keptInputsOf, photosForAgain } from '@/core/jobs'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { againValues, type AgainStart } from './again-start'

type Deps = { db: SupabaseClient; store: () => ObjectStore }

// /generate/[templateId]?again=<jobId>: the user's own finished work of this same template, or
// nothing (a plain workspace). Kept photos are copied back to fresh uploads here, on the server,
// so the workspace opens ready to generate; the Make again link does not prefetch, and a reload
// only leaves one more unused upload for the 7-day lifecycle.
export async function loadAgain(deps: Deps, req: { userId: string; jobId: string | undefined; template: CatalogueTemplate }): Promise<AgainStart | null> {
  if (!req.jobId) return null
  const job = await findOwnJob(deps.db, req.userId, req.jobId)
  if (!job || job.status !== 'succeeded' || job.templateId !== req.template.id) return null
  const base = { jobId: job.id, values: againValues(job.inputs, req.template), madeAt: job.createdAt.toISOString() }
  if (req.template.photoInput === 'none' || (req.template.photoInput === 'optional' && job.inputs.input_key === null)) {
    return { ...base, photos: [], missing: null }
  }
  if (keptInputsOf(job).length === 0) return { ...base, photos: [], missing: 'old' }
  try {
    return { ...base, photos: await photosForAgain(deps.store(), job), missing: null }
  } catch (error) {
    logger.warn('make again: kept photos not copied back', { jobId: job.id, error })
    return { ...base, photos: [], missing: 'failed' }
  }
}
