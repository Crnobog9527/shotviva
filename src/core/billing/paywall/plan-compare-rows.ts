import { packMemberPercentOff } from '../pack-price'
import { photoRange, type PhotoPrices, type PhotoRange } from '../photo-estimate'
import { TIER_LIMITS } from '../tier-limits'
import { monthlyAllowance, type Period, type TierOffer } from './offer'
import type { PerkOptions } from './perks'

// The full comparison under the plans on /pricing (Owner 2026-11-10): the cards' rows in the
// cards' order, one column per tier. Same sources as the cards, so the two never disagree.
export type CompareCell =
  | { format: 'count' | 'pct' | 'hours' | 'weight'; value: number }
  | { format: 'range'; range: PhotoRange }
  | { format: 'check' }
export type CompareRow = { key: string; cells: CompareCell[] }

type Facts = PerkOptions & { photoPrices: PhotoPrices | null }

const count = (value: number): CompareCell => ({ format: 'count', value })
const CHECK: CompareCell = { format: 'check' }

// The estimate row only when every tier has one (a priced template exists).
function photoRow(offers: readonly TierOffer[], prices: PhotoPrices | null, period?: Period): CompareRow[] {
  const ranges = offers.map((offer) => photoRange(monthlyAllowance(offer, period), prices))
  if (ranges.some((range) => range === null)) return []
  return [{ key: 'photos', cells: ranges.map((range) => ({ format: 'range', range: range as PhotoRange })) }]
}

export function compareRows(offers: readonly TierOffer[], facts: Facts, period?: Period): CompareRow[] {
  const limits = offers.map((offer) => TIER_LIMITS[offer.tier])
  return [
    { key: 'credits', cells: offers.map((offer) => count(monthlyAllowance(offer, period))) },
    ...photoRow(offers, facts.photoPrices, period),
    { key: 'concurrency', cells: limits.map((l) => count(l.concurrency)) },
    { key: 'batch', cells: limits.map((l) => count(l.batchMax)) },
    ...(facts.memberPacks ? [{ key: 'memberPacks', cells: offers.map((o): CompareCell => ({ format: 'pct', value: packMemberPercentOff(o.tier) })) }] : []),
    { key: 'support', cells: limits.map((l): CompareCell => ({ format: 'hours', value: l.supportHours })) },
    ...(facts.wishlistLive ? [{ key: 'votes', cells: limits.map((l): CompareCell => ({ format: 'weight', value: l.voteWeight })) }] : []),
    { key: 'noWatermark', cells: offers.map(() => CHECK) },
    { key: 'private', cells: offers.map(() => CHECK) },
    { key: 'allTemplates', cells: offers.map(() => CHECK) },
  ]
}
