import type { Translate } from '@/core/translate'

import type { JobFailure } from '../generation/job-model'

// What the user reads when a photo fails (DESIGN §4.4): the reason in plain words, and whether
// credits came back. Codes come from core/errors or a job's stored error_code; the words are
// in site/messages (app.errors), `t` is scoped there.

// values: TIER_REQUIRED names the plan ({tier}); other messages ignore it.
export function failureReason(failure: JobFailure, t: Translate, values?: Record<string, string>): string {
  return t.has(failure.code) ? t(failure.code, values) : t('fallback')
}

// refunded: true → charged and refunded; false → charged, refund failed; null → never charged.
export function refundLine(failure: JobFailure, t: Translate): string {
  if (failure.refunded === true) return t('refunded')
  if (failure.refunded === false) return t('onHold')
  return t('notCharged')
}

// Whether "Retry" makes sense with the same photo (not for a rejected or unusable photo).
// TIER_REQUIRED would only fail again; it gets the plan's paywall instead.
export const canRetry = (failure: JobFailure) =>
  !['CONTENT_REJECTED', 'IDENTITY_SWAP_REFUSED', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED', 'REFERENCE_IMAGE_LIMIT', 'MODEL_INPUT_UNSUPPORTED', 'TEMPLATE_QUOTE_CHANGED', 'CREDITS_INSUFFICIENT', 'TIER_REQUIRED'].includes(failure.code)

// Failures that say nothing beyond "try again": the settled panel's own line covers them, so
// only a reason the user can act on (a rejected photo, a full queue) is shown next to it.
const GENERIC_FAILURES = new Set(['INTERNAL', 'GENERATION_FAILED', 'PROVIDER_FAILED', 'PROVIDER_TIMEOUT', 'OUTPUT_WRITE_FAILED'])

export function specificReason(failure: JobFailure, t: Translate, values?: Record<string, string>): string | null {
  if (GENERIC_FAILURES.has(failure.code) || !t.has(failure.code)) return null
  return t(failure.code, values)
}

// The failed view says one thing about the credits, as the server reported it: the title says
// "refunded" when they were (so nothing under the photo), otherwise the caption says they are on
// hold (the refund failed) or that nothing was charged. Never both "refunded" and "not charged".
export function failCaption(failure: JobFailure): 'onHold' | 'notCharged' | null {
  if (failure.refunded === true) return null
  return failure.refunded === false ? 'onHold' : 'notCharged'
}

// Where the credits of a failed photo stand, for a select in the copy: refunded, on hold
// (the refund failed), or never charged.
export const refundState = (failure: JobFailure) => (failure.refunded === true ? 'refunded' : failure.refunded === false ? 'hold' : 'none')

const UNKNOWN_FAILURE: JobFailure = { code: 'INTERNAL', message: '', refunded: null }

// A failed job as the settled views read it: its failure (a generic one if none was stored), and
// whether Retry can resend it (`resendable`: the workspace needs the uploaded photo still there).
export function readFailure(failure: JobFailure | null, resendable = true): { failure: JobFailure; retry: boolean } {
  const read = failure ?? UNKNOWN_FAILURE
  return { failure: read, retry: canRetry(read) && resendable }
}
