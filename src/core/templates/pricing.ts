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
  // The route's floor for a template with n image slots (n = "2".."4"), when its data allows one
  // below single × n (1442); absent means single × n.
  slots?: Partial<Record<TemplateQuality, Partial<Record<Resolution, Record<string, number>>>>>
}

export function approvedCredit(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution) {
  return floor.approved?.quality === quality ? floor.approved.costs[resolution] : undefined
}

// The single-image floor multiplier of a template: its number of image slots, at least 1.
export const slotFloorFactor = (fields: { images: { slots?: readonly unknown[] } } | undefined) => Math.max(1, fields?.images.slots?.length ?? 0)

// The floor of a model without a usable cost (sold nowhere until it has one); defined here so the
// slot multiplier below can leave it alone. provider-pricing re-exports it.
export const MISSING_COST = 2147483647

// slots: a template with named image slots (§5.1e) must cover the route's slot floor, like the
// database (admin.slot_route_floor, migration 1442): the full-slot p95, else the single-image floor
// plus the extra input images, else (no data) the single-image floor × its slots. Only the route
// floor changes: the template's own tariff and the missing-cost sentinel stay as they are.
export function creditMinimum(floor: CreditsFloor, quality: TemplateQuality, resolution: Resolution, slots = 1) {
  const tariff = floor.tariff?.quality === quality ? floor.tariff.costs[resolution] : 0
  const route = floor[quality][resolution]
  if (route === MISSING_COST || slots <= 1) return Math.max(tariff, route)
  return Math.max(tariff, floor.slots?.[quality]?.[resolution]?.[String(slots)] ?? route * slots)
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

// slots: a template with named image slots (§5.1e) is held to its route's slot floor (creditMinimum,
// 1442). An approved price still stands as it is.
export function creditsBelowFloor(quality: TemplateQuality, cost: CreditsCost, floor: CreditsFloor, unpriced: readonly Resolution[] = [], slots = 1): FloorViolation[] {
  return RESOLUTIONS.flatMap((resolution) => {
    if (unpriced.includes(resolution)) return []
    const min = creditMinimum(floor, quality, resolution, slots)
    return cost[resolution] < min && cost[resolution] !== approvedCredit(floor, quality, resolution) ? [{ resolution, floor: min, given: cost[resolution] }] : []
  })
}
