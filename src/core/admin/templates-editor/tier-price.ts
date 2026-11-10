import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import { approvedCredit, type CreditsCost, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
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
