import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import type { CreditsCost } from '@/core/templates/pricing'

export function editablePrices(stored: CreditsCost, unpriced: readonly Resolution[] = []): Record<Resolution, string> {
  const field = (tier: Resolution) => unpriced.includes(tier) ? '' : String(stored[tier])
  return { '1k': field('1k'), '2k': field('2k'), '4k': field('4k') }
}

// A blank keeps the historical number for copying/old readers, but explicitly closes the tier.
// A previously confirmed price survives a model switch for other routes that support that tier.
export function storedPrices(fields: Record<Resolution, string>, stored?: CreditsCost,
  supported?: readonly Resolution[], isNew = false) {
  const unpricedResolutions = RESOLUTIONS.filter(tier => !fields[tier].trim() || (isNew && supported && !supported.includes(tier)))
  const value = (tier: Resolution) => fields[tier].trim() ? Number(fields[tier]) : stored?.[tier] ?? 1
  return { unpricedResolutions, creditsCost: { '1k': value('1k'), '2k': value('2k'), '4k': value('4k') } }
}

// The tiers this template offers (the editor's 「提供」 boxes): the ones with a price that its
// model supports. The create page and the poster editor show only these, and generation refuses
// the others (template_image_options and the unpriced check, both from unpriced_resolutions).
export function offeredTiers(fields: Record<Resolution, string>, supported?: readonly Resolution[]): Resolution[] {
  return RESOLUTIONS.filter(tier => fields[tier].trim() !== '' && (!supported || supported.includes(tier)))
}

// Ticking 「提供」 brings back the stored price (the floor check then judges it); unticking blanks
// the box, which closes the tier on save and keeps the stored number for a later reopen.
export function withOffered(fields: Record<Resolution, string>, tier: Resolution, offered: boolean, stored?: CreditsCost) {
  return { ...fields, [tier]: offered ? (fields[tier].trim() || String(stored?.[tier] ?? 1)) : '' }
}
