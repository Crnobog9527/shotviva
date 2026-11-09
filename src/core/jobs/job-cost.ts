import type { ProviderPrices, ProviderUsage } from './provider'

// A job's real cost (ARCHITECTURE §10.0, T33): reported tokens × the per-million price snapshot.
// null whenever a billed part cannot be priced: no usage, a token count missing, or a price that
// is needed but not filled in. A part with zero tokens needs no price.

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

// OpenRouter charges 5.5% when adding credits. Apply this only to its image charge;
// a separately billed decision call uses its own provider's prices.
const OPENROUTER_TOP_UP_FACTOR = 1.055

function estimatedRouterCost(usage: ProviderUsage, prices: ProviderPrices | null | undefined) {
  const input = partCost(usage.prompt_tokens, prices?.inputTextPerM)
  const output = partCost(usage.completion_tokens, prices?.outputPerM)
  return input === null || output === null ? null : ((input + output) / 1e6) * OPENROUTER_TOP_UP_FACTOR
}

function imageCost(usage: ProviderUsage, prices: ProviderPrices | null | undefined): number | null {
  if (usage.cost !== undefined) return usage.cost * OPENROUTER_TOP_UP_FACTOR
  if (usage.prompt_tokens !== undefined || usage.completion_tokens !== undefined) {
    return estimatedRouterCost(usage, prices)
  }
  if (!prices) return null
  let total = 0
  for (const [field, price] of PART_PRICES) {
    const cost = partCost(usage[field], prices[price])
    if (cost === null) return null
    total += cost
  }
  return total / 1e6
}

export function jobCostUsd(
  usage: ProviderUsage | null | undefined,
  prices: ProviderPrices | null | undefined,
  decisionPrices?: ProviderPrices | null,
): number | null {
  if (!usage) return null
  let total = imageCost(usage, prices)
  if (total === null) return null
  for (const [field, price] of DECISION_PRICES) {
    if (usage[field] === undefined) continue
    const cost = partCost(usage[field], decisionPrices?.[price])
    if (cost === null) return null
    total += cost / 1e6
  }
  return round6(total)
}
