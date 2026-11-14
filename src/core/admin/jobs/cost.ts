import type { ModelUsage } from '../overview/stats'

// Admin cost figures (ARCHITECTURE §10.0, T33). Real cost is generation_jobs.cost_usd, summed in
// SQL. Only jobs settled before T33 (no usage, no cost) fall back to the old estimate: succeeded
// images × the per-resolution constant from modules/image (GENERATION_COST_USD), labelled
// 「估算」. Core only does the arithmetic; the price table is passed in.

export type UnitCost = Readonly<Record<string, number>>

// Estimate for pre-T33 succeeded jobs, given per resolution. Unknown resolutions add nothing.
export function legacyEstimate(legacy: Readonly<Record<string, number>>, unitCost: UnitCost): number {
  return Object.entries(legacy).reduce((sum, [resolution, n]) => sum + (unitCost[resolution] ?? 0) * n, 0)
}

export type CostSummary = {
  real: number
  estimated: number
  total: number
  // Total over succeeded images: what one delivered image costs, failures included.
  perImage: number | null
}

export function costSummary(real: number, estimated: number, succeeded: number): CostSummary {
  const total = real + estimated
  return { real, estimated, total, perImage: succeeded === 0 ? null : total / succeeded }
}

export type CostRow = ModelUsage & CostSummary

export function modelCosts(usage: readonly ModelUsage[], unitCost: UnitCost) {
  const rows: CostRow[] = usage.map((row) => ({
    ...row,
    ...costSummary(row.cost_usd, (unitCost[row.resolution] ?? 0) * row.legacy, row.succeeded),
  }))
  const real = rows.reduce((sum, row) => sum + row.real, 0)
  const estimated = rows.reduce((sum, row) => sum + row.estimated, 0)
  const succeeded = rows.reduce((sum, row) => sum + row.succeeded, 0)
  return { rows, total: costSummary(real, estimated, succeeded) }
}

export type JobCostCell = { kind: 'real'; usd: number } | { kind: 'estimate'; usd: number } | { kind: 'uncosted' } | { kind: 'none' }

// One job's cost on /admin/jobs: real when recorded; 「无法计算」 when the provider reported usage
// but a price was missing; an estimate for a pre-T33 success; nothing for the rest.
export function jobCostCell(
  job: { costUsd: number | null; hasUsage: boolean; status: string; resolution: string },
  unitCost: UnitCost,
): JobCostCell {
  if (job.costUsd !== null) return { kind: 'real', usd: job.costUsd }
  if (job.hasUsage) return { kind: 'uncosted' }
  const unit = unitCost[job.resolution]
  return job.status === 'succeeded' && unit !== undefined ? { kind: 'estimate', usd: unit } : { kind: 'none' }
}
