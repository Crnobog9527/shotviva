import 'server-only'

import { logger } from '../../logger'
import type { InputImage, ObjectStore } from '../../storage'
import type { GenerationInputs } from '../../templates'
import type { ProviderInput } from '../provider'
import type { DecisionCost } from '../settle-generation'
import type { DishReaderUsage } from './reading'
import { runFoodFlow, type FoodDeps, type FoodOutcome, type FoodPlan } from './run'

type Call = Omit<ProviderInput, 'signal'>

// The reading's tokens join the decision step's (the face-swap screen), priced at the same
// 'decision' row; without a screen they are the step on their own.
export function withReadCost(decision: DecisionCost | undefined, usage: DishReaderUsage | null, prices: DecisionCost['prices']): DecisionCost | undefined {
  if (!usage) return decision
  return {
    usage: {
      decision_input_tokens: (decision?.usage.decision_input_tokens ?? 0) + usage.inputTokens,
      decision_output_tokens: (decision?.usage.decision_output_tokens ?? 0) + usage.outputTokens,
    },
    prices: decision?.prices ?? prices,
  }
}

// A user's job and an admin test run alike: the call to send and the decision cost to settle with.
// No plan: the ordinary call, untouched.
export async function foodStep(
  deps: { store: ObjectStore; food?: FoodDeps | null },
  plan: FoodPlan | null,
  parts: { call: Call; photos: readonly InputImage[]; inputs: GenerationInputs; decision?: DecisionCost },
  ids: { templateId: string; runId: string },
): Promise<{ call: Call; decision?: DecisionCost }> {
  if (!plan) return { call: parts.call, decision: parts.decision }
  const started = performance.now()
  // Credits are already held: nothing here may throw past the settlement that refunds them.
  const outcome: FoodOutcome = await runFoodFlow(deps, plan, parts.call, parts.photos, parts.inputs).catch((error: unknown) => {
    logger.error('food_flow.failed', { ...ids, error })
    const fallback: FoodOutcome = { call: parts.call, usage: null, choice: { kind: 'both_off', fallback: 'read_failed' } }
    return fallback
  })
  logger.info('food_flow.chosen', {
    ...ids, flow: outcome.choice.kind, fallback: outcome.choice.fallback ?? null,
    category: outcome.category ?? null, vesselId: outcome.vesselId ?? null, ms: Math.round(performance.now() - started),
  })
  return { call: outcome.call, decision: withReadCost(parts.decision, outcome.usage, outcome.prices ?? null) }
}
