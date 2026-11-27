import { tierForBatch, type BatchLimits } from '../../billing/tier-limits'
import { AppError, TierRequiredError } from '../../errors'

export const MAX_BATCH_TEMPLATES = 5

// The batch rule the server enforces, on the account's effective limits (ARCHITECTURE §6.5): an
// org can lift batchMax and multiTemplateMax past the member's tier, so the paywall (TIER_REQUIRED)
// only comes up when the account's own limits, org included, do not cover the request.
export function assertBatchAllowed(limits: BatchLimits, size = 1, templates = 1) {
  if (templates > 1 && templates > limits.multiTemplateMax) {
    if (templates > MAX_BATCH_TEMPLATES) throw new AppError('INVALID_INPUT', 'Invalid template count')
    throw new TierRequiredError('max', 'Multiple templates require Max')
  }
  if (size > limits.batchMax) throw new TierRequiredError(tierForBatch(size) ?? 'max', 'Batch exceeds plan limit')
  if (templates > size) throw new AppError('INVALID_INPUT', 'Invalid template count')
}
