// Shotviva's standard OpenRouter top-up fee, shared by estimates and settlement.
export const OPENROUTER_TOP_UP_FACTOR = 1.055

export type OpenRouterCharge = { cost?: number | null; is_byok?: boolean; upstream_inference_cost?: number }

// What one OpenRouter call cost the site, in USD. On credits: the charge times the top-up fee
// paid when buying them. On BYOK (the Owner's own OpenAI key): OpenAI bills that key directly for
// upstream_inference_cost, with no top-up, and OpenRouter's BYOK fee (`cost`, 0 inside the free
// allowance) comes out of credits, so only the fee takes the factor. 'missing_upstream' when a
// BYOK receipt lacks the upstream figure: never guessed, the caller records no cost.
export function openRouterChargeUsd(usage: OpenRouterCharge): number | 'missing_upstream' | null {
  if (usage.cost == null || usage.is_byok === undefined) return null
  if (!usage.is_byok) return usage.cost * OPENROUTER_TOP_UP_FACTOR
  if (usage.upstream_inference_cost == null) return 'missing_upstream'
  return usage.upstream_inference_cost + usage.cost * OPENROUTER_TOP_UP_FACTOR
}
