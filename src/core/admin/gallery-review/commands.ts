import 'server-only'

import { type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { moderateInputSchema, moderateWorks } from '@/core/moderation'

import { REVIEW_COPY } from './copy'

export type ReviewDeps = {
  db: RpcClient
  // Expires the gallery's cache tag; the server action passes updateTag + refresh.
  invalidate: () => void
}

// Approve or reject up to 50 works in one call (admin_moderate_works checks the admin again).
export async function decideWorks(deps: ReviewDeps, adminId: string, input: unknown): Promise<number> {
  const parsed = moderateInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', REVIEW_COPY.errors.invalid)
  const changed = await moderateWorks(deps.db, adminId, parsed.data)
  deps.invalidate()
  logger.info('admin.gallery.moderated', { adminId, decision: parsed.data.decision, requested: parsed.data.jobIds.length, changed })
  return changed
}
