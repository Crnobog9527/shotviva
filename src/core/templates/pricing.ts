import { z } from 'zod'
import { AppError } from '../errors'

import { withTierKeys } from './db-resolution'
import { RESOLUTIONS, type Resolution } from './output-options'

// A template's price (ARCHITECTURE §5, §6.1): quality tier × the resolution the user picks.
// templates.credits_cost holds one positive integer per resolution; the database check
// enforces the same shape. Rows written before the 4K rename carry a '4k' key: read as '4k'.

export const TEMPLATE_QUALITIES = ['high', 'medium'] as const
export type TemplateQuality = (typeof TEMPLATE_QUALITIES)[number]

const creditNumber = z.number().int().min(1).max(999)

export const creditsCostSchema = withTierKeys(z.strictObject({ '1k': creditNumber, '2k': creditNumber, '4k': creditNumber }))

export type CreditsCost = z.infer<typeof creditsCostSchema>

// Minimum credits per quality × resolution (the floor table lives in modules/image, which
// knows the model's cost; core only applies it).
export type ApprovedTariff = { quality: TemplateQuality; costs: CreditsCost; style_sale_approved?: boolean }
export type CreditsFloor = Record<TemplateQuality, CreditsCost> & {
  approved?: ApprovedTariff
  resolutions?: readonly Resolution[]
  version?: 'v1' | 'v2'
  tariff?: ApprovedTariff
  unknownCapabilities?: boolean
}

export function approvedCredit(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution) {
  return floor.approved?.quality === quality ? floor.approved.costs[resolution] : undefined
}

export function creditMinimum(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution) {
  const tariff = floor.tariff?.quality === quality ? floor.tariff.costs[resolution] : 0
  return Math.max(tariff, floor[quality][resolution])
}

export function assertPricedTier(unpriced: readonly Resolution[] | undefined, tier: Resolution) {
  if (unpriced?.includes(tier)) throw new AppError('TEMPLATE_UNAVAILABLE', 'This tier is not available for sale.')
}

export function assertTemplateQuote(expected: number | undefined, current: number): void {
  if (expected !== undefined && expected !== current) {
    throw new AppError('TEMPLATE_QUOTE_CHANGED', 'Refresh the template price before generating.')
  }
}

export type FloorViolation = { resolution: Resolution; floor: number; given: number }

export function creditsBelowFloor(quality: TemplateQuality, cost: CreditsCost, floor: CreditsFloor, unpriced: readonly Resolution[] = []): FloorViolation[] {
  return RESOLUTIONS.flatMap((resolution) => {
    if (unpriced.includes(resolution)) return []
    const min = creditMinimum(floor, quality, resolution)
    return cost[resolution] < min && cost[resolution] !== approvedCredit(floor, quality, resolution) ? [{ resolution, floor: min, given: cost[resolution] }] : []
  })
}
