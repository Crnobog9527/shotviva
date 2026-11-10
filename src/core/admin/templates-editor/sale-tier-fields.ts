import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import type { CreditsCost } from '@/core/templates/pricing'

export function editablePrices(stored: CreditsCost, unpriced: readonly Resolution[] = []): Record<Resolution, string> {
  const field = (tier: Resolution) => unpriced.includes(tier) ? '' : String(stored[tier])
  return { '1k': field('1k'), '2k': field('2k'), '3k': field('3k') }
}

// A blank keeps the historical number for copying/old readers, but explicitly closes the tier.
// A previously confirmed price survives a model switch for other routes that support that tier.
export function storedPrices(fields: Record<Resolution, string>, stored?: CreditsCost,
  supported?: readonly Resolution[], isNew = false) {
  const unpricedResolutions = RESOLUTIONS.filter(tier => !fields[tier].trim() || (isNew && supported && !supported.includes(tier)))
  const value = (tier: Resolution) => fields[tier].trim() ? Number(fields[tier]) : stored?.[tier] ?? 1
  return { unpricedResolutions, creditsCost: { '1k': value('1k'), '2k': value('2k'), '3k': value('3k') } }
}
