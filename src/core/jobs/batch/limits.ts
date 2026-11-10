import { limitsFor, tierForBatch } from '../../billing/tier-limits'
import type { MembershipTier } from '../../config'
import { AppError, TierRequiredError } from '../../errors'

export const MAX_BATCH_TEMPLATES = 5

export function assertBatchAllowed(tier: MembershipTier | null, size = 1, templates = 1) {
  if (templates > 1 && tier !== 'max') throw new TierRequiredError('max', 'Multiple templates require Max')
  if (size > limitsFor(tier).batchMax) throw new TierRequiredError(tierForBatch(size) ?? 'max', 'Batch exceeds plan limit')
  if (templates > MAX_BATCH_TEMPLATES || templates > size) throw new AppError('INVALID_INPUT', 'Invalid template count')
}
