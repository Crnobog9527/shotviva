import 'server-only'

import { z } from 'zod'

import type { RpcClient } from '../billing/rpc'
import { publicCopyText } from '../gallery/public-copy'
import { logger } from '../logger'
import type { ObjectStore } from '../storage/object-store'
import type { ScreenInput, ScreenVerdict } from './openai-screen'
import type { ModerationStatus } from './reasons'
import { recordAutoModeration } from './rpc'

// One public work through the automatic screen (ARCHITECTURE §9 第 5 条). A failure (no key, the
// API down, a timeout) changes nothing: the work stays pending, hidden, and the sweep retries.

export type ModerationDeps = {
  db: RpcClient
  store: Pick<ObjectStore, 'presignGet'>
  // Null when no key is configured: nothing is screened and every work waits for a person.
  screen: ((input: ScreenInput) => Promise<ScreenVerdict>) | null
}

export const SCREEN_URL_SECONDS = 300

// The columns the screen needs; a sweep reads them for a page of works at once.
export const SCREEN_COLUMNS = 'id, output_key, parent_job_id, inputs'

export const screenRowSchema = z.object({
  id: z.string(),
  output_key: z.string().nullable(),
  parent_job_id: z.string().nullable(),
  inputs: z.record(z.string(), z.unknown()),
})
export type ScreenRow = z.infer<typeof screenRowSchema>

export async function screenWork(deps: ModerationDeps, row: ScreenRow): Promise<ModerationStatus | null | 'skipped'> {
  if (!deps.screen || !row.output_key) return 'skipped'
  try {
    const imageUrl = await deps.store.presignGet(row.output_key, { expiresInSeconds: SCREEN_URL_SECONDS })
    const verdict = await deps.screen({ imageUrl, text: publicCopyText({ parentJobId: row.parent_job_id, inputs: row.inputs }) })
    const status = await recordAutoModeration(deps.db, row.id, verdict)
    logger.info('moderation.screened', { jobId: row.id, flagged: verdict.flagged, status })
    return status
  } catch (error) {
    logger.warn('moderation.screen_failed', { jobId: row.id, error })
    return 'skipped'
  }
}
