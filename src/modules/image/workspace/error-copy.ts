import type { JobFailure } from '../generation/job-model'

// What the user reads when a photo fails (DESIGN §4.4): the reason in plain words, and
// whether credits came back. Codes come from core/errors or a job's stored error_code.
const REASONS: Record<string, string> = {
  CONTENT_REJECTED: "The photo or your note didn't pass the safety check. Try another photo or change the note.",
  GENERATION_FAILED: "The studio couldn't finish this photo. It usually works on a second try.",
  PROVIDER_FAILED: "The studio couldn't finish this photo. It usually works on a second try.",
  PROVIDER_TIMEOUT: 'This photo took too long to develop. It usually works on a second try.',
  OUTPUT_WRITE_FAILED: "We couldn't save the finished photo. Please try again.",
  CREDITS_INSUFFICIENT: "You don't have enough credits for this resolution.",
  IMAGE_TOO_LARGE: 'This photo is larger than 20MB. Please pick a smaller one.',
  IMAGE_UNSUPPORTED: 'Please use a JPG, PNG or WebP photo.',
  INVALID_INPUT: 'Something in the form needs another look. Check the photo and fields, then try again.',
  UNAUTHORIZED: 'Please sign in again.',
}

const FALLBACK = 'Something went wrong. Please try again.'

export function failureReason(failure: JobFailure): string {
  // The rate-limit message is already written for people ("Wait for one of your photos…").
  if (failure.code === 'RATE_LIMITED' && failure.message) return `${failure.message}.`
  return REASONS[failure.code] ?? FALLBACK
}

// refunded: true → charged and refunded; false → charged, refund failed; null → never charged.
export function refundLine(failure: JobFailure): string {
  if (failure.refunded === true) return 'Your credits were refunded.'
  if (failure.refunded === false) return "Your credits are on hold. We'll return them, or contact support."
  return 'No credits were used.'
}

// Whether "Retry" makes sense with the same photo (not for a rejected or unusable photo).
export const canRetry = (failure: JobFailure) => !['CONTENT_REJECTED', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED', 'CREDITS_INSUFFICIENT'].includes(failure.code)
