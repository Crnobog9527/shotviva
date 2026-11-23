import { z } from 'zod'

import { PLATING_TOGGLE, TABLEWARE_TOGGLE } from './food-toggle-keys'

// The food templates' two toggles as their own generation flows (ARCHITECTURE §5.1c「餐饮开关的出图
// 流程」). A template opts in with the private template_prompts.model_params.food_flow: the
// instructions of the dish reading and one prompt body per flow. Without it the toggles stay plain
// prompt fragments, as before. No `server-only`: the admin save checks the same shape.

// Fixed toggle keys: the flow means these two, whatever their labels say.
export { DISH_NAME_COPY, FOOD_COPY_KEYS, FOOD_TOGGLE_KEYS, PLATING_TOGGLE, TABLEWARE_TOGGLE } from './food-toggle-keys'

// Placeholders the flow bodies take, filled from the dish reading and the library vessel. Reserved
// so no copy field, toggle or slot can take the name.
export const FOOD_PLACEHOLDERS = ['food_dish', 'food_dishware', 'food_vessel'] as const

// The dish shapes the vessel library is sorted by; 'unclassifiable' never picks a vessel.
export const DISH_CATEGORIES = ['long', 'soup_stew', 'stir_fry', 'dim_sum', 'cold', 'noodle_rice'] as const
export type DishCategory = (typeof DISH_CATEGORIES)[number]
export const DISH_READ_CATEGORIES = [...DISH_CATEGORIES, 'unclassifiable'] as const
export type DishReadCategory = (typeof DISH_READ_CATEGORIES)[number]

const body = z.string().trim().min(1)
export const foodFlowSchema = z.strictObject({
  // The reading's instructions (what to look at and how to describe it).
  read: body,
  // Tableware on, plating off: [photo, vessel, ...style refs].
  dishware: body.optional(),
  // Plating on, the user's own dishware (as described): [...style refs], no photo.
  plating: body.optional(),
  // Plating and tableware on: [vessel, ...style refs], no photo.
  plating_vessel: body.optional(),
})
export type FoodFlowPrompts = z.infer<typeof foodFlowSchema>

// The stored prompts, or null when the template has none (or they are malformed, which the admin
// save refuses before they can be stored).
export function foodFlowOf(modelParams: Record<string, unknown>): FoodFlowPrompts | null {
  if (modelParams.food_flow === undefined) return null
  const parsed = foodFlowSchema.safeParse(modelParams.food_flow)
  return parsed.success ? parsed.data : null
}

// The admin save's refusals: each toggle the template offers needs its flow's body. Chinese: only
// the admin editor shows them (DESIGN §7).
const missingBodies = (flow: FoodFlowPrompts, plating: boolean, tableware: boolean): string[] => [
  ...(!plating && !tableware ? ['模板没有 plating 或 tableware 开关'] : []),
  ...(tableware && !flow.dishware ? ['缺 dishware（只开器皿）'] : []),
  ...(plating && !flow.plating ? ['缺 plating（开摆盘、用户器皿）'] : []),
  ...(plating && tableware && !flow.plating_vessel ? ['缺 plating_vessel（摆盘和器皿都开）'] : []),
]

export function foodFlowProblems(toggleKeys: readonly string[], modelParams: Record<string, unknown>): string[] {
  if (modelParams.food_flow === undefined) return []
  const parsed = foodFlowSchema.safeParse(modelParams.food_flow)
  if (!parsed.success) return ['餐饮流程 food_flow：格式不对，只能有 read、dishware、plating、plating_vessel 四段文字，且 read 必填']
  const flow = parsed.data
  const missing = missingBodies(flow, toggleKeys.includes(PLATING_TOGGLE), toggleKeys.includes(TABLEWARE_TOGGLE))
  // The flow decides the toggles; a fragment placeholder in its body would render empty.
  const placeholders = Object.values(flow).some((text) => /\{\{\s*(plating|tableware)\s*\}\}/.test(text ?? ''))
  return [
    ...missing.map((item) => `餐饮流程 food_flow：${item}`),
    ...(placeholders ? ['餐饮流程 food_flow：流程正文里不能再放 {{plating}} / {{tableware}}，开关由流程决定'] : []),
  ]
}
