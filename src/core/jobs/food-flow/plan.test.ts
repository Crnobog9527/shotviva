import { describe, expect, it } from 'vitest'

import { chooseFoodFlow, flowExtraImages, foodToggles } from './plan'
import { foodPlanOf } from './food-plan'

const on = (plating: boolean, tableware: boolean) => ({ plating, tableware })
const read = (category: 'long' | 'unclassifiable') => ({ category })

describe('which food flow a job runs (§5.1c)', () => {
  it('maps the toggle pair, the reading and the vessel onto the four flows', () => {
    expect(chooseFoodFlow(on(false, true), read('long'), true)).toEqual({ kind: 'dishware' })
    expect(chooseFoodFlow(on(true, false), read('long'), false)).toEqual({ kind: 'plating' })
    expect(chooseFoodFlow(on(true, true), read('long'), true)).toEqual({ kind: 'plating_vessel' })
  })

  it('falls back to flow 1 when the reading failed, whatever was on', () => {
    for (const toggles of [on(true, false), on(false, true), on(true, true)]) {
      expect(chooseFoodFlow(toggles, null, false)).toEqual({ kind: 'both_off', fallback: 'read_failed' })
    }
  })

  it('keeps the user dishware for an unclassifiable dish or an empty category', () => {
    expect(chooseFoodFlow(on(false, true), read('unclassifiable'), false)).toEqual({ kind: 'both_off', fallback: 'unclassifiable' })
    expect(chooseFoodFlow(on(true, true), read('unclassifiable'), false)).toEqual({ kind: 'plating', fallback: 'unclassifiable' })
    expect(chooseFoodFlow(on(true, true), read('long'), false)).toEqual({ kind: 'plating', fallback: 'no_vessel' })
    // Plating alone never needs a category.
    expect(chooseFoodFlow(on(true, false), read('unclassifiable'), false)).toEqual({ kind: 'plating' })
  })

  it('plans a flow only for a template with its prompts and a toggle on', () => {
    const params = { food_flow: { read: 'R', plating: 'P' } }
    expect(foodPlanOf(params, { plating: true, tableware: false })).toMatchObject({ toggles: on(true, false) })
    expect(foodPlanOf(params, { plating: false, tableware: false })).toBeNull()
    expect(foodPlanOf({}, { plating: true })).toBeNull()
    expect(foodToggles({ plating: true, other: true })).toEqual(on(true, false))
  })

  it('counts the library vessel for routing only when tableware is on', () => {
    expect(flowExtraImages(on(true, false))).toBe(0)
    expect(flowExtraImages(on(false, true))).toBe(1)
  })
})
