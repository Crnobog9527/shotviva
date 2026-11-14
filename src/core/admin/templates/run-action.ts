import 'server-only'

import { toAppError } from '@/core/errors'
import { logger } from '@/core/logger'

import type { ActionFailure, ActionResult, ActionValue } from './types'

function failure(error: unknown): ActionFailure {
  const appError = toAppError(error)
  if (appError.code === 'INTERNAL') {
    logger.error('admin.action.failed', { error: appError.cause ?? appError })
    return { ok: false, code: appError.code, message: '保存失败，请稍后重试' }
  }
  return { ok: false, code: appError.code, message: appError.message }
}

// Turns thrown errors into a serialisable result for the client; INTERNAL details are logged,
// never returned.
export async function runAdminAction(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work()
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

// Same, for an action that hands a value back (e.g. a presigned upload URL).
export async function runAdminQuery<T>(work: () => Promise<T>): Promise<ActionValue<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return failure(error)
  }
}
