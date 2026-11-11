import 'server-only'

import { z } from 'zod'

import { AppError } from '../errors'
import { logger } from '../logger'
import { copyBackKeptInputs, downloadVariantKeyFor, inputPreviewKeyFor, type ObjectStore } from '../storage'
import { EDIT_TEMPLATE_ID } from '../templates/edit-params'
import type { Job } from './job-schema'

// ARCHITECTURE §8.3「输入图随作品保留」(T40). The copies' keys sit in the job's own inputs, under
// kept_inputs, written by confirm_job in the call that settles the job (settle-generation.ts).

const keptSchema = z.array(z.string().min(1)).max(30)

// The kept copies of a job's uploads; [] for works made before T40, edits, and failed copies.
export function keptInputsOf(job: Pick<Job, 'inputs'>): string[] {
  const parsed = keptSchema.safeParse(job.inputs.kept_inputs)
  return parsed.success ? parsed.data : []
}

// Long enough for the workspace thumbnail and the developing view that reuses it.
const PREVIEW_SECONDS = 3600

export type AgainPhoto = { inputKey: string; bytes: number; url: string }

// Make again (T40): the work's kept photos as fresh uploads, ready for /api/generate. The caller
// has already read the job as its owner. Only a finished template work qualifies; one with
// nothing kept is NOT_FOUND, and the workspace then asks for the photo again.
export async function photosForAgain(store: ObjectStore, job: Job): Promise<AgainPhoto[]> {
  const kept = job.status === 'succeeded' && job.templateId !== EDIT_TEMPLATE_ID ? keptInputsOf(job) : []
  if (kept.length === 0) throw new AppError('NOT_FOUND', 'Nothing kept for this work')
  const restored = await copyBackKeptInputs(store, { userId: job.userId, jobId: job.id }, kept)
  return Promise.all(
    restored.map(async (photo) => ({ ...photo, url: await store.presignGet(photo.inputKey, { expiresInSeconds: PREVIEW_SECONDS }) })),
  )
}

// Every file a work owns (§8.3: kept and deleted together): the result, the 768px preview (T32)
// and the kept uploads (T40), plus any staged 白底 / 透明底 download copy (§8; usually absent, and a
// missing key deletes fine). For deleting one work; account deletion clears both user prefixes.
export function workFileKeys(job: Pick<Job, 'id' | 'userId' | 'outputKey' | 'inputs'>): string[] {
  const staged = (['white', 'marked'] as const).map((variant) => downloadVariantKeyFor(job.userId, job.id, variant))
  return [...(job.outputKey ? [job.outputKey] : []), inputPreviewKeyFor(job.userId, job.id), ...keptInputsOf(job), ...staged]
}

// Best effort: every key is tried; a failure is logged and counted, never thrown, because the
// work is already deleted in the database by then (T41). Returns how many could not be deleted.
export async function deleteWorkFiles(store: ObjectStore, job: Pick<Job, 'id' | 'userId' | 'outputKey' | 'inputs'>): Promise<number> {
  const results = await Promise.allSettled(workFileKeys(job).map((key) => store.delete(key)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) logger.error('work files not deleted', { jobId: job.id, failed: failed.length, error: failed[0]?.reason })
  return failed.length
}
