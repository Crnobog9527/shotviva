import { RESOLUTIONS, type Resolution } from './output-options'
import { TEMPLATE_QUALITIES, type ApprovedTariff, type CreditsCost, type CreditsFloor } from './pricing'

type Costs = Partial<Record<Resolution, number>>
export type ProviderFloors = CreditsFloor & {
  providers?: Record<string, CreditsFloor>
  models?: Record<string, string>
  activeProvider?: string
  version?: 'v1' | 'v2'
  approvals?: Record<string, Record<string, ApprovedTariff>>
}
export const MISSING_COST = 2147483647
const unknownTiers = { '1k': MISSING_COST, '2k': MISSING_COST, '3k': MISSING_COST }
export const UNPRICED: CreditsFloor = { high: unknownTiers, medium: unknownTiers }

export function floorGuidance(min: number): string {
  return min === MISSING_COST ? '先刷新供应商能力并填写该档每张成本估价' : `建议积分 ≥ ${min}`
}

// The OpenAI safeguard stays in force when measured costs fall. Its conservative dollar estimates
// also scale with the product catalogue when the site's credit denomination changes.
export const OPENAI_MINIMUM: CreditsFloor = {
  high: { '1k': 2, '2k': 4, '3k': 6 },
  medium: { '1k': 1, '2k': 2, '3k': 3 },
}
const OPENAI_ESTIMATES: CreditsFloor = {
  high: { '1k': 0.081, '2k': 0.135, '3k': 0.206 },
  medium: { '1k': 0.055, '2k': 0.095, '3k': 0.135 },
}

export function maxCostPerCredit(products: readonly { priceUsd: number; credits: number }[]): number {
  return imageCostBudget(Math.min(...products.map(product => product.priceUsd / product.credits)))
}

export function imageCostBudget(cheapest: number): number {
  if (!(cheapest > 0 && Number.isFinite(cheapest))) throw new Error('Cannot price images without a positive product price per credit')
  // Pricing framework: 7.9% payment, 3% refund provision, 10% annual affiliate + 3% team, 60% margin.
  return cheapest * (1 - 0.239) * (1 - 0.60)
}

export function minimumCredits(costUsd: number, budget: number): number {
  return Math.max(1, Math.ceil(costUsd * 1.10 / budget))
}

type ModelCosts = { openAI: boolean; resolutions: readonly Resolution[]; p95: Costs; estimates: Costs }

export function modelCreditFloor(model: ModelCosts, budget: number): CreditsFloor {
  const floor: CreditsFloor = { high: {} as CreditsCost, medium: {} as CreditsCost }
  for (const quality of TEMPLATE_QUALITIES) {
    for (const resolution of RESOLUTIONS) {
      const fallback = model.openAI ? OPENAI_ESTIMATES[quality][resolution] : undefined
      const cost = model.p95[resolution] ?? model.estimates[resolution] ?? fallback
      let min = cost === undefined ? MISSING_COST : minimumCredits(cost, budget)
      if (model.openAI) min = Math.max(min, OPENAI_MINIMUM[quality][resolution])
      floor[quality][resolution] = model.resolutions.includes(resolution) ? min : 1
    }
  }
  return floor
}

export function providerFloor(floors: ProviderFloors, id: string | null | undefined, templateId?: string): CreditsFloor {
  const selected = id ?? floors.activeProvider
  const base = selected && floors.providers ? floors.providers[selected] ?? UNPRICED : floors
  const approved = selected && templateId ? floors.approvals?.[selected]?.[templateId] : undefined
  return approved ? { ...base, approved } : base
}
