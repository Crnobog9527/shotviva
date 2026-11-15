import 'server-only'

import { logger } from '../../logger'
import type { InputImage, ObjectStore } from '../../storage'
import type { GenerationInputs } from '../../templates'
import type { GenerationProvider, ProviderInput } from '../provider'
import type { DecisionCost } from '../settle-generation'
import type { DishReaderUsage } from './reading'
import type { FoodChoice } from './plan'
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

// The whole step's ceiling. Credits are already held and the provider call still needs its own
// 240 s inside the route's 300: past this the step gives up (the reading may still finish, unused).
export const FOOD_STEP_TIMEOUT_MS = 30_000

const flow1 = (call: Call, fallback: FoodChoice['fallback'], readError: string): FoodOutcome => ({ call, usage: null, choice: { kind: 'both_off', fallback }, readError })

// Nothing here may throw past the settlement that refunds the credits, nor outlast its deadline.
async function bounded(run: Promise<FoodOutcome>, base: Call, ids: Record<string, string>, ms = FOOD_STEP_TIMEOUT_MS): Promise<FoodOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<FoodOutcome>((resolve) => {
    timer = setTimeout(() => {
      logger.warn('food_flow.timeout', ids)
      resolve(flow1(base, 'read_failed', `food step over ${ms / 1000} s`))
    }, ms)
  })
  try {
    return await Promise.race([run.catch((error: unknown) => {
      logger.error('food_flow.failed', { ...ids, error })
      return flow1(base, 'read_failed', 'food step failed')
    }), late])
  } finally {
    clearTimeout(timer)
  }
}

// The rebuilt call has other images and maybe a fixed ratio: one the routed model would refuse
// after credits are held goes back to the ordinary call, which routing already accepted.
function fitting(outcome: FoodOutcome, base: Call, provider: Pick<GenerationProvider, 'minReferences' | 'maxReferences' | 'accepts'>): FoodOutcome {
  if (outcome.call === base) return outcome
  const count = outcome.call.images.length
  const fits = count >= (provider.minReferences ?? 0) && count <= (provider.maxReferences ?? Infinity)
    && provider.accepts?.({ resolution: outcome.call.resolution, aspectRatio: outcome.call.aspectRatio, referenceCount: count }) !== false
  return fits ? outcome : { ...outcome, call: base, choice: { kind: 'both_off', fallback: 'unsupported' } }
}

// A user's job and an admin test run alike: the call to send and the decision cost to settle with.
// No plan: the ordinary call, untouched.
export async function foodStep(
  deps: { store: ObjectStore; food?: FoodDeps | null },
  plan: FoodPlan | null,
  parts: { call: Call; photos: readonly InputImage[]; inputs: GenerationInputs; decision?: DecisionCost },
  ids: { templateId: string; runId: string },
  provider: Pick<GenerationProvider, 'minReferences' | 'maxReferences' | 'accepts'>,
): Promise<{ call: Call; decision?: DecisionCost }> {
  if (!plan) return { call: parts.call, decision: parts.decision }
  const started = performance.now()
  const outcome = fitting(await bounded(runFoodFlow(deps, plan, parts.call, parts.photos, parts.inputs), parts.call, ids), parts.call, provider)
  logger.info('food_flow.chosen', {
    ...ids, flow: outcome.choice.kind, fallback: outcome.choice.fallback ?? null,
    category: outcome.category ?? null, vesselId: outcome.vesselId ?? null, ms: Math.round(performance.now() - started),
  })
  deps.food?.onOutcome?.({ flow: outcome.choice.kind, fallback: outcome.choice.fallback ?? null, readError: outcome.readError ?? null })
  return { call: outcome.call, decision: withReadCost(parts.decision, outcome.usage, outcome.prices ?? null) }
}
