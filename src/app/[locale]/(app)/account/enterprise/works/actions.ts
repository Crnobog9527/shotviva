'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { createAdminSupabase, requireUser } from '@/core/auth'
import { toAppError } from '@/core/errors'
import { logger } from '@/core/logger'
import { orgOwnerDeleteWork } from '@/core/org/works'
import { r2Store } from '@/core/storage'

// 企业作品: the org owner deletes one of the org's works. A public endpoint like every server
// action, so the account comes from the session; org_owner_delete_work checks it owns the work's
// org. Someone else's or a missing work reads as done (nothing of theirs to show).
export async function deleteOrgWorkAction(jobId: string): Promise<{ failed: 'running' | 'error' } | undefined> {
  const user = await requireUser('/account/enterprise/works')
  if (!z.uuid().safeParse(jobId).success) return undefined
  try {
    await orgOwnerDeleteWork({ db: createAdminSupabase(), store: r2Store() }, { owner: user.id, jobId })
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'CONFLICT') return { failed: 'running' }
    if (appError.code !== 'NOT_FOUND') {
      logger.error('org.works.delete.failed', { jobId, error: appError.cause ?? appError })
      return { failed: 'error' }
    }
  }
  refresh()
  return undefined
}
