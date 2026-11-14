import type { TestRunView } from '../test-runs'
import { TestRunError } from './api'
import { TEST_RUN_COPY as COPY } from './copy'

// What the panel says when a request fails before a run exists (budget, face-swap refusal, a
// field the template requires...). The server's own message is shown for input problems, since it
// names the field; anything unexpected gets the generic line.
export function failureMessage(error: unknown): string {
  if (!(error instanceof TestRunError)) return COPY.errors.fallback!
  const known = COPY.errors[error.code]
  if (known) return known
  if (['CONFLICT', 'INVALID_INPUT', 'NOT_FOUND', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED', 'UPLOAD_FAILED'].includes(error.code)) return error.message
  return COPY.errors.fallback!
}

// Why a run that started still failed (its error_code).
export const runFailure = (run: Pick<TestRunView, 'errorCode'>) => COPY.failures[run.errorCode ?? ''] ?? run.errorCode ?? '未知原因'

export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 })
