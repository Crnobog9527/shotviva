import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing'
import { TierRequiredError } from '../../errors'
import { logger } from '../../logger'
import { signBatchZip } from '../../storage'
import { batchArchive } from './archive'

export async function downloadBatchZip(db: SupabaseClient, userId: string, batchId: string) {
  const args = { p_user_id: userId, p_batch_id: batchId, p_token: randomUUID() }
  const status = await callRpc(db, 'claim_batch_zip', args, z.enum(['upgrade', 'limited', 'packing', 'acquired']))
  if (status === 'upgrade') throw new TierRequiredError('pro', 'Batch downloads require Pro or Max')
  if (status !== 'acquired') return { status } as const

  try {
    const archive = await batchArchive(db, userId, batchId)
    const url = await signBatchZip(archive)
    return { status: 'ready', url, files: archive.files } as const
  } finally {
    // A crashed instance or failed release is recoverable after the bounded lease.
    await callRpc(db, 'release_batch_zip', args, z.null()).catch(error =>
      logger.warn('batch ZIP lease release failed', { batch_id: batchId, error }))
  }
}
