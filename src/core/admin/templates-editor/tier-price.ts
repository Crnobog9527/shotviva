import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { approvedCredit, worstMargin, type CreditsCost, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
import { floorGuidance } from '@/core/templates/provider-pricing'

export const unsupportedTier = (floor: CreditsFloor, resolution: Resolution) =>
  floor.resolutions !== undefined && !floor.resolutions.includes(resolution)

export function tierGuidance(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution): string {
  const min = floor[quality][resolution]
  const cost = unsupportedTier(floor, resolution) ? '所选模型不支持此档' : floorGuidance(min, floor.unknownCapabilities)
  const approved = approvedCredit(floor, quality, resolution)
  if (approved !== undefined) return `目录收费 ${approved} 积分起。此价已批准；其他报价须满足${cost}。`
  if (floor.tariff?.quality === quality) return `目录收费 ${floor.tariff.costs[resolution]} 积分起。当前模型：${cost}。`
  return cost
}

export function summaryPrice(costs: CreditsCost, floor: CreditsFloor, unpriced: readonly Resolution[] = []) {
  return RESOLUTIONS.map(tier => {
    if (unsupportedTier(floor, tier)) return '不可用'
    return unpriced.includes(tier) ? '未定价' : costs[tier]
  }).join(' / ')
}

const percent = (fraction: number) => `${Math.floor(fraction * 100 + 1e-9)}%`

// 1568: the floor stops only a loss; the margin target is advice. A price at or above the floor
// shows its worst-case margin, flagged (yellow, never blocking) under the target.
export function marginNote(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution, price: string | number, slots = 1) {
  if (unsupportedTier(floor, resolution) || String(price).trim() === '') return undefined
  const margin = worstMargin(floor, quality, resolution, Number(price), slots)
  if (!margin || margin.margin < 0) return undefined
  return { text: `最坏毛利 ${percent(margin.margin)}（目标 ${percent(margin.target)}）`, low: margin.low }
}

// The tiers of a saved template priced under the margin target, for the price table.
export function lowMarginTiers(costs: CreditsCost, floor: CreditsFloor, quality: TemplateQuality,
  unpriced: readonly Resolution[] = [], slots = 1): Resolution[] {
  return RESOLUTIONS.filter(tier => !unpriced.includes(tier) && marginNote(floor, quality, tier, costs[tier], slots)?.low)
}
