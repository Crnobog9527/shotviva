import { foodFlowOf } from '../../templates/food-flow'
import { foodToggles, runsFoodFlow } from './plan'
import type { FoodPlan } from './run'

// The job's flow plan, or null when it is an ordinary call: no flow prompts on the template, or
// neither toggle on.
export function foodPlanOf(modelParams: Record<string, unknown>, toggles: Record<string, boolean>): FoodPlan | null {
  const prompts = foodFlowOf(modelParams)
  const chosen = foodToggles(toggles)
  return runsFoodFlow(prompts, chosen) ? { prompts, toggles: chosen } : null
}
