import { RESOLUTIONS, type Resolution } from './output-options'
import { MISSING_COST, TEMPLATE_QUALITIES, type ApprovedTariff, type CreditsCost, type CreditsFloor } from './pricing'

type Costs = Partial<Record<Resolution, number>>
export type ProviderFloors = CreditsFloor & {
  providers?: Record<string, CreditsFloor>
  models?: Record<string, string>
  activeProvider?: string
  tariffs?: Record<string, ApprovedTariff>
  approvals?: Record<string, Record<string, ApprovedTariff>>
}
export { MISSING_COST }
const unknownTiers = { '1k': MISSING_COST, '2k': MISSING_COST, '4k': MISSING_COST }
export const UNPRICED: CreditsFloor = { high: unknownTiers, medium: unknownTiers, unknownCapabilities: true }

export function floorGuidance(min: number, unknownCapabilities?: boolean): string {
  if (unknownCapabilities) return '所选模型的能力尚未确认，暂不能校验此档成本'
  return min === MISSING_COST ? '缺少该档单张成本报价，且实测样本不足；请在供应商配置补充估价' : `成本保护下限 ${min} 积分`
}

// The OpenAI safeguard stays in force when measured costs fall. Its conservative dollar estimates
// also scale with the product catalogue when the site's credit denomination changes.
export const OPENAI_MINIMUM: CreditsFloor = {
  high: { '1k': 2, '2k': 4, '4k': 6 },
  medium: { '1k': 1, '2k': 2, '4k': 3 },
}
const OPENAI_ESTIMATES: CreditsFloor = {
  high: { '1k': 0.081, '2k': 0.135, '4k': 0.206 },
  medium: { '1k': 0.055, '2k': 0.095, '4k': 0.135 },
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

// p95ByQuality (1295): the route's p95 per quality, from jobs that recorded it. When the read
// has it, a template's floor follows only its own quality's jobs (as the database check does) and
// the mixed p95 is not used; older reads without it keep the mixed p95.
type ModelCosts = {
  openAI: boolean
  resolutions: readonly Resolution[]
  p95: Costs
  p95ByQuality?: Partial<Record<(typeof TEMPLATE_QUALITIES)[number], Costs>>
  estimates: Costs
  // 1442: the model's cost per extra input image, and the p95 of full-slot jobs by number of slots.
  slotCosts?: { extraInputUsd?: number | null; p95Full?: Partial<Record<(typeof TEMPLATE_QUALITIES)[number], Partial<Record<Resolution, Record<string, number>>>>> }
}

const SLOT_COUNTS = [2, 3, 4] as const

// The same three steps as admin.slot_route_floor: full-slot p95 (never below the single floor),
// else single + the extra inputs, else nothing here (creditMinimum falls back to single × n).
function slotFloor(model: ModelCosts, quality: (typeof TEMPLATE_QUALITIES)[number], resolution: Resolution, single: number, n: number, budget: number) {
  const p95 = model.slotCosts?.p95Full?.[quality]?.[resolution]?.[String(n)]
  if (p95 !== undefined) return Math.max(single, Math.ceil(p95 * 1.10 / budget))
  const extra = model.slotCosts?.extraInputUsd
  if (extra !== undefined && extra !== null) return single + Math.ceil((n - 1) * extra * 1.10 / budget)
  return undefined
}

function measuredCost(model: ModelCosts, quality: (typeof TEMPLATE_QUALITIES)[number], resolution: Resolution) {
  return model.p95ByQuality ? model.p95ByQuality[quality]?.[resolution] : model.p95[resolution]
}

type Quality = (typeof TEMPLATE_QUALITIES)[number]

function routeMinimum(model: ModelCosts, quality: Quality, resolution: Resolution, budget: number) {
  const fallback = model.openAI ? OPENAI_ESTIMATES[quality][resolution] : undefined
  const cost = measuredCost(model, quality, resolution) ?? model.estimates[resolution] ?? fallback
  const min = cost === undefined ? MISSING_COST : minimumCredits(cost, budget)
  return model.openAI ? Math.max(min, OPENAI_MINIMUM[quality][resolution]) : min
}

// The slot floors this route's data allows (n = 2..4); none means single × n.
function slotFloors(model: ModelCosts, quality: Quality, resolution: Resolution, single: number, budget: number) {
  const entries = SLOT_COUNTS.flatMap(n => {
    const slot = slotFloor(model, quality, resolution, single, n, budget)
    return slot === undefined ? [] : [[String(n), slot] as const]
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

export function modelCreditFloor(model: ModelCosts, budget: number): CreditsFloor {
  const floor: CreditsFloor = { high: {} as CreditsCost, medium: {} as CreditsCost, resolutions: model.resolutions }
  for (const quality of TEMPLATE_QUALITIES) {
    for (const resolution of RESOLUTIONS) {
      const supported = model.resolutions.includes(resolution)
      const min = routeMinimum(model, quality, resolution, budget)
      floor[quality][resolution] = supported ? min : 1
      const slots = supported && min !== MISSING_COST ? slotFloors(model, quality, resolution, min, budget) : undefined
      if (slots) ((floor.slots ??= {})[quality] ??= {})[resolution] = slots
    }
  }
  return floor
}

function selectedFloor(floors: ProviderFloors, selected?: string): CreditsFloor {
  if (!selected || !floors.providers) return floors
  return floors.providers[selected] ?? UNPRICED
}

function approvedOnRoute(floors: ProviderFloors, selected: string | undefined, templateId: string) {
  return selected ? floors.approvals?.[selected]?.[templateId] : undefined
}

export function providerFloor(floors: ProviderFloors, id: string | null | undefined, templateId = ''): CreditsFloor {
  const selected = id ?? floors.activeProvider
  const approved = approvedOnRoute(floors, selected, templateId)
  const tariff = floors.tariffs?.[templateId] ?? approved
  return { ...selectedFloor(floors, selected), approved, tariff, version: floors.version }
}
