import 'server-only'

import { z } from 'zod'

import { AppError } from '../errors'
import { galleryVariantKeys } from '../gallery/variants'
import { logger } from '../logger'
import { copyBackKeptInputs, DOWNLOAD_VARIANTS, downloadVariantKeyFor, inputPreviewKeyFor, workThumbKeyFor, type ObjectStore } from '../storage'
import { EDIT_TEMPLATE_ID } from '../templates/edit-params'
import { keptSlotIndex, storedSlotOrder } from '../templates/image-slots'
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

// slot: for a slot template's work (§5.1e), which box the photo goes back to.
export type AgainPhoto = { inputKey: string; bytes: number; url: string; slot?: string }

// The slot a kept copy came from: kept copy n is the n-th image sent, and inputs.input_slots
// lists the filled slots in send order. A failed copy is missing from kept_inputs, so the
// number in the key decides, never the position in the list.
function slotOfKept(job: Job, kept: string): string | undefined {
  const order = storedSlotOrder(job.inputs.input_slots)
  const index = keptSlotIndex(kept)
  return index === null ? undefined : order[index]
}

// Make again (T40): the work's kept photos as fresh uploads, ready for /api/generate. The caller
// has already read the job as its owner. Only a finished template work qualifies; one with
// nothing kept is NOT_FOUND, and the workspace then asks for the photo again.
export async function photosForAgain(store: ObjectStore, job: Job): Promise<AgainPhoto[]> {
  const kept = job.status === 'succeeded' && job.templateId !== EDIT_TEMPLATE_ID ? keptInputsOf(job) : []
  if (kept.length === 0) throw new AppError('NOT_FOUND', 'Nothing kept for this work')
  const restored = await copyBackKeptInputs(store, { userId: job.userId, jobId: job.id }, kept)
  return Promise.all(
    restored.map(async (photo, index) => {
      const slot = slotOfKept(job, kept[index]!)
      return { ...photo, url: await store.presignGet(photo.inputKey, { expiresInSeconds: PREVIEW_SECONDS }), ...(slot ? { slot } : {}) }
    }),
  )
}

// Every file a work owns (§8.3: kept and deleted together): the result, its small copy for lists
// (「作品小图」), the 768px preview (T32) and the kept uploads (T40), plus any staged 白底 / 透明底
// download copy or pair ZIP (§8; usually absent, and a missing key deletes fine), and the
// gallery's copies (§9 第 9 条; only approved works have them). For deleting one work; account
// deletion clears both user prefixes.
export function workFileKeys(job: Pick<Job, 'id' | 'userId' | 'outputKey' | 'inputs'>): string[] {
  const staged = DOWNLOAD_VARIANTS.map((variant) => downloadVariantKeyFor(job.userId, job.id, variant))
  const gallery = job.outputKey ? galleryVariantKeys(job.outputKey) : []
  return [
    ...(job.outputKey ? [job.outputKey] : []),
    workThumbKeyFor(job.userId, job.id),
    inputPreviewKeyFor(job.userId, job.id),
    ...keptInputsOf(job),
    ...staged,
    ...gallery,
  ]
}

// Best effort: every key is tried; a failure is logged and counted, never thrown, because the
// work is already deleted in the database by then (T41). Returns how many could not be deleted.
export async function deleteWorkFiles(store: ObjectStore, job: Pick<Job, 'id' | 'userId' | 'outputKey' | 'inputs'>): Promise<number> {
  const results = await Promise.allSettled(workFileKeys(job).map((key) => store.delete(key)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) logger.error('work files not deleted', { jobId: job.id, failed: failed.length, error: failed[0]?.reason })
  return failed.length
}
