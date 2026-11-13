import type { AdminTemplate } from '../../src/core/admin/templates/types'
import type { ProviderPrices } from '../../src/core/jobs'
import type { EstimatedImageCosts } from '../../src/core/templates/image-capabilities'
import { estimateRunUsd, INPUT_ALLOWANCE_USD } from '../../src/modules/image/test-run/estimate'
import type { Cell } from './cells'

// The face-swap screen's share of a trial call.
export const JUDGE_ALLOWANCE_USD = 0.005

// What the estimate needs from the provider a cell will call.
export type EstimateSource = { prices?: ProviderPrices | null; estimatedImageCosts?: EstimatedImageCosts | null }

// One estimate per cell, plus the face-swap screen. A provider priced per image (its admin row's
// 预估单张总成本) costs that plus the input allowance; any other costs the trial's own estimate
// (estimateRunUsd) at its prices. A bound template counts only its own provider: trials refuse a
// fallback (bound-provider.ts). Providers are resolved once per binding.
export function cellEstimateUsd(cell: Pick<Cell, 'resolution'>, quality: AdminTemplate['quality'], source: EstimateSource) {
  const perImage = source.estimatedImageCosts?.[cell.resolution]
  const base = perImage !== undefined ? perImage + INPUT_ALLOWANCE_USD : estimateRunUsd(cell.resolution, quality, source.prices)
  return base + JUDGE_ALLOWANCE_USD
}

