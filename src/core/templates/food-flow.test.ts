import { describe, expect, it } from 'vitest'

import { foodFlowOf, foodFlowProblems } from './food-flow'
import { templateFieldsSchema } from './schema'
import { providerParams, toggleSetupProblems } from './toggles'

// Fake bodies only: the real flow prompts live in the private template_prompts (ARCHITECTURE §5.1c).
const FLOW = { read: 'READ', dishware: 'DISHWARE', plating: 'PLATING', plating_vessel: 'PLATING-VESSEL' }
const toggle = (key: string) => ({ key, label: key, default: false as const })

describe('food flow prompts (§5.1c)', () => {
  it('reads the stored prompts, and nothing from a template without them or with a malformed shape', () => {
    expect(foodFlowOf({ food_flow: FLOW })).toEqual(FLOW)
    expect(foodFlowOf({})).toBeNull()
    expect(foodFlowOf({ food_flow: { read: '' } })).toBeNull()
    expect(foodFlowOf({ food_flow: { ...FLOW, extra: 'x' } })).toBeNull()
  })

  it('never sends the flow prompts to the image provider', () => {
    expect(providerParams({ food_flow: FLOW, background: 'opaque' })).toEqual({ background: 'opaque' })
  })

  it('asks each offered toggle for its body, and both on for the vessel body', () => {
    expect(foodFlowProblems(['plating', 'tableware'], { food_flow: FLOW })).toEqual([])
    expect(foodFlowProblems(['tableware'], { food_flow: { read: 'R', dishware: 'D' } })).toEqual([])
    expect(foodFlowProblems(['plating', 'tableware'], { food_flow: { read: 'R', plating: 'P' } })).toEqual([
      '餐饮流程 food_flow：缺 dishware（只开器皿）', '餐饮流程 food_flow：缺 plating_vessel（摆盘和器皿都开）',
    ])
    expect(foodFlowProblems(['other'], { food_flow: FLOW })).toEqual(['餐饮流程 food_flow：模板没有 plating 或 tableware 开关'])
    expect(foodFlowProblems(['plating'], { food_flow: { dishware: 'D' } })[0]).toContain('格式不对')
    expect(foodFlowProblems(['plating'], {})).toEqual([])
  })

  it('refuses a toggle placeholder inside a flow body, which the flow would render empty', () => {
    expect(foodFlowProblems(['plating'], { food_flow: { read: 'R', plating: 'Cook it. {{ plating }}' } })).toEqual([
      '餐饮流程 food_flow：流程正文里不能再放 {{plating}} / {{tableware}}，开关由流程决定',
    ])
  })

  it('joins the admin save checks of the toggles', () => {
    const fragments = { plating: { on: 'ON', off: 'OFF' } }
    expect(toggleSetupProblems([toggle('plating')], 'Body {{plating}}', { toggles: fragments, food_flow: { read: 'R' } }))
      .toEqual(['餐饮流程 food_flow：缺 plating（开摆盘、用户器皿）'])
  })

  it('reserves the flow placeholders, so no field can take their names', () => {
    const fields = { images: { min: 1, max: 1 }, copy: [{ key: 'food_dish', label: 'Dish' }], aspectRatios: ['1:1'] }
    expect(templateFieldsSchema.safeParse(fields).success).toBe(false)
  })
})
