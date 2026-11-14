import 'server-only'

import { logger } from '@/core/logger'
import { ProviderSettingError, type ProviderSettingReason } from '@/core/providers'

import type { ProviderActionResult } from './types'

// Turns a thrown error into a reason the page can show in its own words. Unexpected errors are
// logged and reported as 'internal'; no message text reaches the browser.
export function reasonFor(error: unknown): ProviderSettingReason {
  if (error instanceof ProviderSettingError) return error.reason
  logger.error('admin.provider.action_failed', { error })
  return 'internal'
}

export async function runProviderAction<T>(work: () => Promise<T>): Promise<ProviderActionResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    return { ok: false, reason: reasonFor(error) }
  }
}
