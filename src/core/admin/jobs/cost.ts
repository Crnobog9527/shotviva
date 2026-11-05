import type { ModelUsage } from '../overview/stats'

export type CostRow = ModelUsage & { unit: number | null; cost: number | null }

// Estimated spend: succeeded images × unit price for that resolution. The price table comes
// from modules/image (next to the credit floor); core only does the arithmetic.
export function estimateCosts(usage: readonly ModelUsage[], unitCost: Readonly<Record<string, number>>) {
  const rows: CostRow[] = usage.map((row) => {
    const unit = unitCost[row.resolution] ?? null
    return { ...row, unit, cost: unit === null ? null : unit * row.succeeded }
  })
  const total = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
  return { rows, total }
}
