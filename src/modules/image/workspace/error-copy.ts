import type { Translate } from '@/core/translate'

import type { JobFailure } from '../generation/job-model'

// What the user reads when a photo fails (DESIGN §4.4): the reason in plain words, and whether
// credits came back. Codes come from core/errors or a job's stored error_code; the words are
// in site/messages (app.errors), `t` is scoped there.

export function failureReason(failure: JobFailure, t: Translate): string {
  return t.has(failure.code) ? t(failure.code) : t('fallback')
}

// refunded: true → charged and refunded; false → charged, refund failed; null → never charged.
export function refundLine(failure: JobFailure, t: Translate): string {
  if (failure.refunded === true) return t('refunded')
  if (failure.refunded === false) return t('onHold')
  return t('notCharged')
}

// Whether "Retry" makes sense with the same photo (not for a rejected or unusable photo).
export const canRetry = (failure: JobFailure) => !['CONTENT_REJECTED', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED', 'CREDITS_INSUFFICIENT'].includes(failure.code)
