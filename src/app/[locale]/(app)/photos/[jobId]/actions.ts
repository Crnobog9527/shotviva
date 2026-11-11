'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { toAppError } from '@/core/errors'
import { GALLERY_CACHE_TAG } from '@/core/gallery/cache'
import { localized } from '@/core/i18n/server'
import { deleteOwnWork } from '@/core/jobs'
import { logger } from '@/core/logger'
import { r2Store } from '@/core/storage'

// Delete one of your own works (T41, ARCHITECTURE §6.2「删除作品」). Server actions are public
// endpoints, so the session is checked here; delete_own_job checks ownership and status. The
// job id is bound by the page, never read from the form.
export async function deleteWorkAction(jobId: string): Promise<{ failed: 'running' | 'error' } | undefined> {
  try {
    const user = await requireApiUser()
    await deleteOwnWork({ db: createAdminSupabase(), store: r2Store() }, { userId: user.id, jobId })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'CONFLICT') return { failed: 'running' }
    // Someone else's, missing or already gone: nothing of theirs to show; back to Photos.
    if (appError.code !== 'NOT_FOUND') {
      logger.error('photos.delete.failed', { jobId, error: appError.cause ?? appError })
      return { failed: 'error' }
    }
  }
  // Photos and this page read per request; drop the client router's copies of both. A deleted
  // public work leaves the gallery's cached pages at once (ARCHITECTURE §9 第 6 条, T108).
  updateTag(GALLERY_CACHE_TAG)
  revalidatePath('/[locale]/photos', 'layout')
  redirect(await localized('/photos?deleted=1'))
}
