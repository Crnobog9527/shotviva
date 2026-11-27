'use server'

import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { toAppError } from '@/core/errors'
import { localized } from '@/core/i18n/server'
import { logger } from '@/core/logger'
import { createWorkShare } from '@/core/work-share'
import type { CreateShareRequest, CreateShareResult } from '@/modules/image'

// 作品集分享 (ARCHITECTURE §6.2): server actions are public endpoints, so this checks the session
// here; create_work_share then checks that every work is the caller's own (migration 1871). The
// input comes from the browser and is validated again in core. There is no live-link cap to hit
// any more: the oldest live links give way (migration 1993), so a refusal is the hourly / daily one.

export async function createWorkShareAction(request: CreateShareRequest): Promise<CreateShareResult> {
  try {
    const user = await requireApiUser()
    const id = await createWorkShare(createAdminSupabase(), user.id, request)
    return { path: await localized(`/s/w/${id}`) }
  } catch (error) {
    const appError = toAppError(error)
    // Someone else's work, a deleted, unfinished or rejected one: the picker is stale or the work
    // may not be shared.
    if (appError.code === 'NOT_FOUND' || appError.code === 'INVALID_INPUT') return { failed: 'gone' }
    if (appError.code === 'RATE_LIMITED') return { failed: 'busy' }
    logger.error('work_share.create_failed', { error: appError.cause ?? appError })
    return { failed: 'error' }
  }
}
