import { PLATING_TOGGLE, TABLEWARE_TOGGLE, type DishCategory, type DishReadCategory, type FoodFlowPrompts } from '../../templates/food-flow'

// Which flow a food template's job runs (ARCHITECTURE §5.1c「餐饮开关的出图流程」), from the two
// toggles, the dish reading and whether the library has a vessel for its category. Pure: the
// caller does the reading and the pick.

export type FoodFlowKind = 'both_off' | 'dishware' | 'plating' | 'plating_vessel'
// Why a job with a toggle on still ran another flow; logged with the job.
export type FoodFallback = 'read_failed' | 'unclassifiable' | 'no_vessel'

export type FoodChoice = { kind: FoodFlowKind; fallback?: FoodFallback }

export type FoodToggles = { plating: boolean; tableware: boolean }

export function foodToggles(toggles: Record<string, boolean>): FoodToggles {
  return { plating: toggles[PLATING_TOGGLE] === true, tableware: toggles[TABLEWARE_TOGGLE] === true }
}

// The flow runs only for a template with its prompts and a job with at least one of the toggles
// on; everything else is the template's ordinary call.
export const runsFoodFlow = (prompts: FoodFlowPrompts | null, toggles: FoodToggles): prompts is FoodFlowPrompts =>
  prompts !== null && (toggles.plating || toggles.tableware)

export const isLibraryCategory = (category: DishReadCategory): category is DishCategory => category !== 'unclassifiable'

// A failed reading is flow 1 (both off). Unclassifiable, or no vessel in its category, keeps the
// user's dishware: plating alone, or flow 1 when only tableware was on.
export function chooseFoodFlow(toggles: FoodToggles, reading: { category: DishReadCategory } | null, hasVessel: boolean): FoodChoice {
  if (!reading) return { kind: 'both_off', fallback: 'read_failed' }
  if (!toggles.tableware) return { kind: 'plating' }
  if (hasVessel) return { kind: toggles.plating ? 'plating_vessel' : 'dishware' }
  const fallback: FoodFallback = isLibraryCategory(reading.category) ? 'no_vessel' : 'unclassifiable'
  return { kind: toggles.plating ? 'plating' : 'both_off', fallback }
}

// The extra images a flow can send besides the template's own photo and references: the library
// vessel. Routing counts it before any credit is held, so the flow never meets a route that
// cannot take it.
export const flowExtraImages = (toggles: FoodToggles): number => (toggles.tableware ? 1 : 0)
