import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'
import { syncGalleryVariants } from '@/core/gallery/variant-sync'
import { logger } from '@/core/logger'
import { moderateInputSchema, moderateWorks } from '@/core/moderation'
import type { ObjectStore } from '@/core/storage'

import { REVIEW_COPY } from './copy'

export type ReviewDeps = {
  db: RpcClient & Pick<SupabaseClient, 'from'>
  store: ObjectStore
  // Expires the gallery's cache tag; the server action passes updateTag + refresh.
  invalidate: () => void
  // Runs a task after the response (the server action passes next/server's after).
  defer: (task: () => Promise<unknown>) => void
}

// Approve or reject up to 50 works in one call (admin_moderate_works checks the admin again).
// After the response, approved works get their gallery copies (a first view then reads a small
// file) and rejected ones lose theirs (ARCHITECTURE §9 第 9 条).
export async function decideWorks(deps: ReviewDeps, adminId: string, input: unknown): Promise<number> {
  const parsed = moderateInputSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', REVIEW_COPY.errors.invalid)
  const changed = await moderateWorks(deps.db, adminId, parsed.data)
  deps.invalidate()
  deps.defer(() => syncGalleryVariants(deps, parsed.data.decision, parsed.data.jobIds))
  logger.info('admin.gallery.moderated', { adminId, decision: parsed.data.decision, requested: parsed.data.jobIds.length, changed })
  return changed
}
