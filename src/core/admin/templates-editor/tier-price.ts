import type { Resolution } from '@/core/templates/output-options'
import { approvedCredit, STYLE_STANDARD_CREDITS, type CreditsFloor, type TemplateQuality } from '@/core/templates/pricing'
import { floorGuidance, MISSING_COST } from '@/core/templates/provider-pricing'

export const unsupportedTier = (floor: CreditsFloor, resolution: Resolution) =>
  floor.resolutions !== undefined && !floor.resolutions.includes(resolution)

// The DB requires three integers, even on retired templates. Keep an existing
// unpublished value when safe and bring old-unit placeholders up to the real floor.
export function draftCredits(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution, existing: string) {
  if (!floor.styleDraft) return existing
  if (resolution === '1k') return String(STYLE_STANDARD_CREDITS)
  const min = floor[quality][resolution]
  return min === MISSING_COST ? existing : String(Math.max(Number(existing), min))
}

export function tierGuidance(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution): string {
  const min = floor[quality][resolution]
  const cost = unsupportedTier(floor, resolution) ? '所选模型不支持此档' : floorGuidance(min, floor.unknownCapabilities)
  if (floor.styleDraft) {
    const price = resolution === '1k' ? `规划收费 ${STYLE_STANDARD_CREDITS} 积分` : '收费未定'
    return `${price} · 未开放销售。${cost}`
  }
  const approved = approvedCredit(floor, quality, resolution)
  if (approved !== undefined) return `目录收费 ${approved} 积分起。此价已批准；其他报价须满足${cost}。`
  if (floor.tariff?.quality === quality) return `目录收费 ${floor.tariff.costs[resolution]} 积分起。当前模型：${cost}。`
  return cost
}
