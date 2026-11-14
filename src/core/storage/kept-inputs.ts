import 'server-only'

import { logger } from '../logger'
import { contentTypeOfKey, isKeptInputKey, keptInputKeyFor, newInputKey } from './keys'
import type { ObjectStore } from './object-store'

// ARCHITECTURE §8.3「输入图随作品保留」(T40): the photos a work was made from live next to it
// under outputs/{user_id}/, so Make again can start from them long after inputs/ expired.
// Every move is an R2 server-side copy; no image bytes pass through a function (AGENTS §6).

type JobRef = { userId: string; jobId: string }

// At settle, after the job is confirmed. Returns the keys that were copied, in input order;
// a failed copy is logged and left out, so it can never undo a finished, charged result.
export async function keepJobInputs(store: ObjectStore, job: JobRef, inputKeys: readonly string[]): Promise<string[]> {
  const copied = await Promise.all(
    inputKeys.map(async (inputKey, index) => {
      const kept = keptInputKeyFor(job.userId, job.jobId, index + 1, inputKey)
      try {
        await store.copy(inputKey, kept)
        return kept
      } catch (error) {
        logger.warn('job input not kept', { jobId: job.jobId, n: index + 1, error })
        return null
      }
    }),
  )
  return copied.filter((key): key is string => key !== null)
}

export type RestoredInput = { inputKey: string; bytes: number }

// Make again: each kept photo becomes a fresh upload under inputs/, so generation runs exactly
// as for a photo just picked (same key check, same 7-day lifecycle for an unused copy). Keys
// are re-checked against the job; anything else, or a copy that fails, throws.
export async function copyBackKeptInputs(store: ObjectStore, job: JobRef, keptKeys: readonly string[]): Promise<RestoredInput[]> {
  return Promise.all(
    keptKeys.map(async (kept) => {
      const contentType = contentTypeOfKey(kept)
      if (!isKeptInputKey(job.userId, job.jobId, kept) || !contentType) throw new Error(`not a kept input of job ${job.jobId}`)
      const head = await store.head(kept)
      if (!head) throw new Error(`kept input missing for job ${job.jobId}`)
      const inputKey = newInputKey(job.userId, contentType)
      await store.copy(kept, inputKey)
      return { inputKey, bytes: head.size }
    }),
  )
}
