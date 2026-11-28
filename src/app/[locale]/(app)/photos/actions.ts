'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { headers } from 'next/headers'
import { redirect, RedirectType } from 'next/navigation'
import { z } from 'zod'

import { clientIp, createAdminSupabase, createServerSupabase, requireApiUser } from '@/core/auth'
import { AppError, toAppError } from '@/core/errors'
import { GALLERY_CACHE_TAG } from '@/core/gallery/cache'
import { currentLocale, localized } from '@/core/i18n/server'
import { deleteOwnWork, deleteOwnWorks, recordJobDownload } from '@/core/jobs'
import { logger } from '@/core/logger'
import { r2Store } from '@/core/storage'
import { loadAgainContext, type AgainContext, type BulkDeleteResult } from '@/modules/image'

// Delete one of your own works (T41, ARCHITECTURE §6.2「删除作品」). Server actions are public
// endpoints, so the session is checked here; delete_own_job checks ownership and status. The
// job id comes from the Photos viewer, so it is checked like any input.
export async function deleteWorkAction(jobId: string): Promise<{ failed: 'running' | 'org' | 'error' } | undefined> {
  try {
    const user = await requireApiUser()
    if (!z.uuid().safeParse(jobId).success) throw new AppError('NOT_FOUND', 'Not a job id')
    await deleteOwnWork({ db: createAdminSupabase(), store: r2Store() }, { userId: user.id, jobId })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'CONFLICT') return { failed: 'running' }
    if (appError.code === 'FORBIDDEN') return { failed: 'org' }
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
  // Replace: the viewer pushed the work's address, and Back must not land on a deleted work.
  redirect(await localized('/photos?deleted=1'), RedirectType.replace)
}

// Delete the works picked on Photos (作品页改版 PR④): at most 30 at once, each through the same
// deleteOwnWork as one work's delete (core/jobs/delete-work.ts). Server actions are public
// endpoints: the session is checked here and the ids like any input. No redirect: the grid is
// re-read and the picker reports what stayed.
const bulkIds = z.array(z.uuid()).min(1).max(30)

export async function deleteWorksAction(jobIds: string[]): Promise<BulkDeleteResult> {
  const user = await requireApiUser()
  const parsed = bulkIds.safeParse(jobIds)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'Pick 1 to 30 works')
  const result = await deleteOwnWorks({ db: createAdminSupabase(), store: r2Store() }, user.id, parsed.data)
  if (result.deleted > 0) {
    // As one work's delete: the gallery's cached pages and the client router's copy of Photos.
    updateTag(GALLERY_CACHE_TAG)
    revalidatePath('/[locale]/photos', 'layout')
  }
  return result
}

// The album view showed these works full size for a long-press save (a phone whose browser cannot
// share files; ARCHITECTURE §6.2): one download noted for each, as the download route notes one.
// record_job_download only touches the caller's own finished works, so other ids do nothing.
// Best effort like the route's note: it never fails the page.
export async function noteWorksSavedAction(jobIds: string[]): Promise<void> {
  const user = await requireApiUser()
  const parsed = bulkIds.safeParse(jobIds)
  if (!parsed.success) throw new AppError('INVALID_INPUT', 'Pick 1 to 30 works')
  const db = createAdminSupabase()
  const ip = clientIp(await headers())
  await Promise.all([...new Set(parsed.data)].map((jobId) => recordJobDownload(db, { userId: user.id, jobId, ip })))
}

// Make again inside the Photos viewer (T40): the work's template, settings and kept photos,
// copied back to fresh uploads as /generate/[templateId]?again= does. null when the work or its
// template is not there any more; the viewer then offers the workspace page instead.
export async function prepareAgainAction(jobId: string): Promise<AgainContext | null> {
  try {
    const user = await requireApiUser()
    if (!z.uuid().safeParse(jobId).success) return null
    const deps = { db: await createServerSupabase(), admin: createAdminSupabase(), store: r2Store, locale: await currentLocale() }
    return await loadAgainContext(deps, { userId: user.id, jobId })
  } catch (error) {
    logger.error('photos.again.failed', { jobId, error: toAppError(error).cause ?? error })
    return null
  }
}
