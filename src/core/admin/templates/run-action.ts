import 'server-only'

import { toAppError } from '@/core/errors'
import { logger } from '@/core/logger'

import type { ActionResult } from './types'

// Turns thrown errors into a serialisable result for the client; INTERNAL details are logged,
// never returned.
export async function runAdminAction(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work()
    return { ok: true }
  } catch (error) {
    const appError = toAppError(error)
    if (appError.code === 'INTERNAL') {
      logger.error('admin.action.failed', { error: appError.cause ?? appError })
      return { ok: false, code: appError.code, message: '保存失败，请稍后重试' }
    }
    return { ok: false, code: appError.code, message: appError.message }
  }
}
