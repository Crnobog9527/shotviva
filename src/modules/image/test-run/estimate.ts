import type { ProviderPrices } from '@/core/jobs'
import type { Resolution, TemplateQuality } from '@/core/templates'
import type { EstimatedImageCosts } from '@/core/templates/image-capabilities'

import { outputTokens } from '../provider'

// What a test run holds against the daily budget while it is still going (ARCHITECTURE §10.b,
// T85). Deliberately on the high side so a ×3 batch cannot slip past the budget: the tier's square
// (the most output tokens any ratio of that tier may cost, §8.1), at GPT Image 2.6's count, which
// is never below 2.5's, at the provider's output price (else the official one), plus an allowance
// for the input photo, the prompt and the decision call. Replaced by the real cost when it ends.

const SQUARE_EDGE: Record<Resolution, number> = { '1k': 1024, '2k': 2048, '4k': 2880 }
const OFFICIAL_OUTPUT_PER_M = 30
export const INPUT_ALLOWANCE_USD = 0.02

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export function estimateRunUsd(resolution: Resolution, quality: TemplateQuality, prices: ProviderPrices | null | undefined): number {
  const edge = SQUARE_EDGE[resolution]
  const tokens = outputTokens('gpt-image-2.6', edge, edge, quality)
  const perM = prices?.outputPerM ?? OFFICIAL_OUTPUT_PER_M
  return round6((tokens * perM) / 1e6 + INPUT_ALLOWANCE_USD)
}

// What the estimate needs from the provider row a run will call.
export type EstimateSource = {
  prices?: ProviderPrices | null
  // The admin's 预估单张总成本 by tier: set for providers billed per image (Ark).
  estimatedImageCosts?: EstimatedImageCosts | null
  // Each input photo past the first (a slot template's extra uploads), in USD (1440).
  extraInputImageUsd?: number | null
}

// A provider priced per image (its row has a 预估单张总成本 for the tier) holds that, plus
// extra_input_image_usd for each photo past the first; any other (OpenAI) holds the token
// estimate above. Used by the admin trial and the local trial script (scripts/template-trial).
export function providerRunEstimateUsd(resolution: Resolution, quality: TemplateQuality, source: EstimateSource, photoCount = 1): number {
  const perImage = source.estimatedImageCosts?.[resolution]
  if (perImage === undefined) return estimateRunUsd(resolution, quality, source.prices)
  return round6(perImage + (source.extraInputImageUsd ?? 0) * Math.max(0, photoCount - 1))
}
