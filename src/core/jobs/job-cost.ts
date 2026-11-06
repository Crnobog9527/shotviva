import type { ProviderPrices, ProviderUsage } from './provider'

// A job's real cost (ARCHITECTURE §10.0, T33): reported tokens × the per-million price snapshot.
// null whenever a billed part cannot be priced: no usage, a token count missing, or a price that
// is needed but not filled in. A part with zero tokens needs no price. Never an estimate.

const PART_PRICES = [
  ['input_text_tokens', 'inputTextPerM'],
  ['input_image_tokens', 'inputImagePerM'],
  ['output_tokens', 'outputPerM'],
] as const

// The photo-edit decision step (T30), priced at the decision provider's own rates.
const DECISION_PRICES = [
  ['decision_input_tokens', 'inputTextPerM'],
  ['decision_output_tokens', 'outputPerM'],
] as const

// numeric(10, 6) in generation_jobs.cost_usd.
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

function partCost(tokens: number | undefined, pricePerM: number | null | undefined): number | null {
  if (tokens === undefined) return null
  if (tokens === 0) return 0
  return pricePerM === null || pricePerM === undefined ? null : tokens * pricePerM
}

// `decisionPrices` prices decision_input_tokens / decision_output_tokens (the photo-edit decision
// step, T30) at that provider's input / output price; a job without them does not need it.
export function jobCostUsd(
  usage: ProviderUsage | null | undefined,
  prices: ProviderPrices | null | undefined,
  decisionPrices?: ProviderPrices | null,
): number | null {
  if (!usage || !prices) return null
  let total = 0
  for (const [field, price] of PART_PRICES) {
    const cost = partCost(usage[field], prices[price])
    if (cost === null) return null
    total += cost
  }
  for (const [field, price] of DECISION_PRICES) {
    if (usage[field] === undefined) continue
    const cost = partCost(usage[field], decisionPrices?.[price])
    if (cost === null) return null
    total += cost
  }
  return round6(total / 1e6)
}
