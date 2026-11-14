import type { AdminTemplate } from '../../src/core/admin/templates/types'
import { providerRunEstimateUsd, type EstimateSource } from '../../src/modules/image/test-run/estimate'
import type { Cell } from './cells'

// The face-swap screen's share of a trial call.
export const JUDGE_ALLOWANCE_USD = 0.005

export type { EstimateSource }

// One estimate per cell, plus the face-swap screen: the same hold the app's trial books
// (providerRunEstimateUsd: a per-image provider's 预估单张总成本, else the token estimate). A bound
// template counts only its own provider: trials refuse a fallback (bound-provider.ts). Providers are resolved once per binding.
export function cellEstimateUsd(cell: Pick<Cell, 'resolution'>, quality: AdminTemplate['quality'], source: EstimateSource) {
  return providerRunEstimateUsd(cell.resolution, quality, source) + JUDGE_ALLOWANCE_USD
}

