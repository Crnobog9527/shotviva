import type { ProviderPrices } from '@/core/jobs'
import type { Resolution, TemplateQuality } from '@/core/templates'

import { outputTokens } from '../provider'

// What a test run holds against the daily budget while it is still going (ARCHITECTURE §10.b,
// T85). Deliberately on the high side so a ×3 batch cannot slip past the budget: the tier's square
// (the most output tokens any ratio of that tier may cost, §8.1), at GPT Image 2.6's count, which
// is never below 2.5's, at the provider's output price (else the official one), plus an allowance
// for the input photo, the prompt and the decision call. Replaced by the real cost when it ends.

const SQUARE_EDGE: Record<Resolution, number> = { '1k': 1024, '2k': 2048, '4k': 2880 }
const OFFICIAL_OUTPUT_PER_M = 30
export const INPUT_ALLOWANCE_USD = 0.02

export function estimateRunUsd(resolution: Resolution, quality: TemplateQuality, prices: ProviderPrices | null | undefined): number {
  const edge = SQUARE_EDGE[resolution]
  const tokens = outputTokens('gpt-image-2.6', edge, edge, quality)
  const perM = prices?.outputPerM ?? OFFICIAL_OUTPUT_PER_M
  return Math.round(((tokens * perM) / 1e6 + INPUT_ALLOWANCE_USD) * 1e6) / 1e6
}
