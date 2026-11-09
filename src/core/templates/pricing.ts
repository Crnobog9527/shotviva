import { z } from 'zod'
import { AppError } from '../errors'

import { RESOLUTIONS, type Resolution } from './output-options'

// A template's price (ARCHITECTURE §5, §6.1): quality tier × the resolution the user picks.
// templates.credits_cost holds one positive integer per resolution; the database check
// enforces the same shape.

export const STYLE_STANDARD_CREDITS = 20

export const TEMPLATE_QUALITIES = ['high', 'medium'] as const
export type TemplateQuality = (typeof TEMPLATE_QUALITIES)[number]

const creditNumber = z.number().int().min(1).max(999)

export const creditsCostSchema = z.strictObject({ '1k': creditNumber, '2k': creditNumber, '3k': creditNumber })

export type CreditsCost = z.infer<typeof creditsCostSchema>

// Minimum credits per quality × resolution (the floor table lives in modules/image, which
// knows the model's cost; core only applies it).
export type ApprovedTariff = { quality: TemplateQuality; costs: CreditsCost }
export type CreditsFloor = Record<TemplateQuality, CreditsCost> & {
  approved?: ApprovedTariff
  resolutions?: readonly Resolution[]
  version?: 'v1' | 'v2'
  tariff?: ApprovedTariff
  unknownCapabilities?: boolean
  styleDraft?: boolean
  retiredRoom?: boolean
}

export function approvedCredit(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution) {
  return floor.approved?.quality === quality ? floor.approved.costs[resolution] : undefined
}

export function creditMinimum(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution) {
  const tariff = floor.tariff?.quality === quality ? floor.tariff.costs[resolution] : 0
  return Math.max(tariff, floor[quality][resolution])
}

export function assertTemplateQuote(expected: number | undefined, current: number): void {
  if (expected !== undefined && expected !== current) {
    throw new AppError('TEMPLATE_QUOTE_CHANGED', 'Refresh the template price before generating.')
  }
}

export type FloorViolation = { resolution: Resolution; floor: number; given: number }

export function creditsBelowFloor(quality: TemplateQuality, cost: CreditsCost, floor: CreditsFloor): FloorViolation[] {
  return RESOLUTIONS.flatMap((resolution) => {
    const min = creditMinimum(floor, quality, resolution)
    return cost[resolution] < min && cost[resolution] !== approvedCredit(floor, quality, resolution) ? [{ resolution, floor: min, given: cost[resolution] }] : []
  })
}
