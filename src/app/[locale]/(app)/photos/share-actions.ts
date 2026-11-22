'use server'

import { revalidatePath } from 'next/cache'

import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { toAppError } from '@/core/errors'
import { localized } from '@/core/i18n/server'
import { logger } from '@/core/logger'
import { createWorkShare, isWorkShareId, revokeWorkShare } from '@/core/work-share'
import type { CreateShareRequest, CreateShareResult } from '@/modules/image'

// 作品集分享 (ARCHITECTURE §6.2): server actions are public endpoints, so each checks the session
// here; create_work_share / revoke_work_share then check that every work and the link are the
// caller's own (migration 1871). The input comes from the browser and is validated again in core.

export async function createWorkShareAction(request: CreateShareRequest): Promise<CreateShareResult> {
  try {
    const user = await requireApiUser()
    const id = await createWorkShare(createAdminSupabase(), user.id, request)
    revalidatePath('/[locale]/photos/shares', 'page')
    return { path: await localized(`/s/w/${id}`) }
  } catch (error) {
    const appError = toAppError(error)
    // Someone else's work, a deleted or unfinished one: the picker is stale.
    if (appError.code === 'NOT_FOUND' || appError.code === 'INVALID_INPUT') return { failed: 'gone' }
    if (appError.code === 'RATE_LIMITED') return { failed: 'limit' }
    logger.error('work_share.create_failed', { error: appError.cause ?? appError })
    return { failed: 'error' }
  }
}

export async function revokeWorkShareAction(shareId: string): Promise<{ ok: boolean }> {
  try {
    const user = await requireApiUser()
    if (!isWorkShareId(shareId)) return { ok: false }
    await revokeWorkShare(createAdminSupabase(), user.id, shareId)
    revalidatePath('/[locale]/photos/shares', 'page')
    return { ok: true }
  } catch (error) {
    logger.error('work_share.revoke_failed', { error: toAppError(error).cause ?? error })
    return { ok: false }
  }
}
