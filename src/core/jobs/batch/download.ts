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

export async function downloadBatchZip(db: SupabaseClient, userId: string, batchId: string, background: DownloadBackground = 'white') {
  const args = { p_user_id: userId, p_batch_id: batchId, p_token: randomUUID() }
  const status = await callRpc(db, 'claim_batch_zip', args, z.enum(['upgrade', 'limited', 'packing', 'acquired']))
  if (status === 'upgrade') throw new TierRequiredError('pro', 'Batch downloads require Pro or Max')
  if (status !== 'acquired') return { status } as const

  try {
    const archive = await batchArchive(db, userId, batchId, background)
    // One at a time: a 3K cut-out decodes to ~33MB, and the copies outlive this ZIP for reuse.
    const store = r2Store()
    for (const copy of archive.white) {
      await stageVariant(store, { sourceKey: copy.source, key: copy.key, contentType: 'image/jpeg', make: flattenOnWhite })
    }
    const url = await signBatchZip(archive)
    return { status: 'ready', url, files: archive.files } as const
  } finally {
    // A crashed instance or failed release is recoverable after the bounded lease.
    await callRpc(db, 'release_batch_zip', args, z.null()).catch(error =>
      logger.warn('batch ZIP lease release failed', { batch_id: batchId, error }))
  }
}
