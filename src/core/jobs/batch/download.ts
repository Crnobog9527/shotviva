import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing'
import { TierRequiredError } from '../../errors'
import { logger } from '../../logger'
import { flattenOnWhite, r2Store, signBatchZip, stageVariant } from '../../storage'
import type { DownloadBackground } from '../../storage/rules/download-background'
import { batchArchive } from './archive'

// Links stay valid long enough for a phone to fetch a batch chunk by chunk between share taps.
const PHOTO_LINK_SECONDS = 900

// The tier check, the per-minute limit and the packing lease are one claim shared by the ZIP and
// the phone's save-to-photos links, so neither path can reach photos the other would refuse.
async function withBatchClaim<T>(db: SupabaseClient, userId: string, batchId: string, work: () => Promise<T>) {
  const args = { p_user_id: userId, p_batch_id: batchId, p_token: randomUUID() }
  const status = await callRpc(db, 'claim_batch_zip', args, z.enum(['upgrade', 'limited', 'packing', 'acquired']))
  if (status === 'upgrade') throw new TierRequiredError('pro', 'Batch downloads require Pro or Max')
  if (status !== 'acquired') return { status } as const

  try {
    return { status: 'ready', ...(await work()) } as const
  } finally {
    // A crashed instance or failed release is recoverable after the bounded lease.
    await callRpc(db, 'release_batch_zip', args, z.null()).catch(error =>
      logger.warn('batch ZIP lease release failed', { batch_id: batchId, error }))
  }
}

async function stageWhiteCopies(archive: Awaited<ReturnType<typeof batchArchive>>) {
  // One at a time: a 4K cut-out decodes to ~33MB, and the copies outlive this ZIP for reuse.
  const store = r2Store()
  for (const copy of archive.white) {
    await stageVariant(store, { sourceKey: copy.source, key: copy.key, contentType: 'image/jpeg', make: flattenOnWhite })
  }
}

export function downloadBatchZip(db: SupabaseClient, userId: string, batchId: string, background: DownloadBackground = 'white') {
  return withBatchClaim(db, userId, batchId, async () => {
    const archive = await batchArchive(db, userId, batchId, background)
    await stageWhiteCopies(archive)
    return { url: await signBatchZip(archive), files: archive.files }
  })
}

// The same photos the ZIP would hold (paid, finished, clean, 白底 copies staged the same way),
// as one short-lived link each, for a phone that saves them to its photo library instead.
export function downloadBatchPhotos(db: SupabaseClient, userId: string, batchId: string, background: DownloadBackground = 'white') {
  return withBatchClaim(db, userId, batchId, async () => {
    const archive = await batchArchive(db, userId, batchId, background)
    await stageWhiteCopies(archive)
    const store = r2Store()
    const photos = await Promise.all(archive.files.map(async file => ({
      jobId: file.jobId, name: file.name, url: await store.presignGet(file.key, { expiresInSeconds: PHOTO_LINK_SECONDS }),
    })))
    return { photos, files: archive.files }
  })
}
