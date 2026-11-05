import { z } from 'zod'

import { RESOLUTIONS, type Resolution } from './output-options'

// A template's price (ARCHITECTURE §5, §6.1): quality tier × the resolution the user picks.
// templates.credits_cost holds one positive integer per resolution; the database check
// enforces the same shape.

export const TEMPLATE_QUALITIES = ['high', 'medium'] as const
export type TemplateQuality = (typeof TEMPLATE_QUALITIES)[number]

const creditNumber = z.number().int().min(1).max(999)

export const creditsCostSchema = z.strictObject({ '1k': creditNumber, '2k': creditNumber, '3k': creditNumber })

export type CreditsCost = z.infer<typeof creditsCostSchema>

// Minimum credits per quality × resolution (the floor table lives in modules/image, which
// knows the model's cost; core only applies it).
export type CreditsFloor = Record<TemplateQuality, CreditsCost>

export type FloorViolation = { resolution: Resolution; floor: number; given: number }

export function creditsBelowFloor(quality: TemplateQuality, cost: CreditsCost, floor: CreditsFloor): FloorViolation[] {
  return RESOLUTIONS.flatMap((resolution) => {
    const min = floor[quality][resolution]
    return cost[resolution] < min ? [{ resolution, floor: min, given: cost[resolution] }] : []
  })
}
