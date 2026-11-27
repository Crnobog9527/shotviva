import { describe, expect, it } from 'vitest'

import { foodSwitchedOff } from './food-toggle-keys'
import { offeredCopyFields, offeredTemplate, offeredToggles } from './offered-toggles'

// 2009: 优化摆盘 and 优化器皿 are each offered only while its own site-wide switch is on.
const OFF = { plating: false, tableware: false }
const ON = { plating: true, tableware: true }
const TABLEWARE_ONLY = { plating: false, tableware: true }
const PLATING_ONLY = { plating: true, tableware: false }
const toggles = [{ key: 'plating', label: 'Plating' }, { key: 'tableware', label: 'Tableware' }, { key: 'steam', label: 'Steam' }]
const keys = (list: readonly { key: string }[]) => list.map((item) => item.key)

describe('offeredToggles', () => {
  it('hides plating and tableware while both switches are off, keeps any other toggle', () => {
    expect(keys(offeredToggles(toggles, OFF))).toEqual(['steam'])
    expect(offeredToggles(toggles.slice(0, 2), OFF)).toEqual([])
  })

  it('hides only the toggle whose switch is off', () => {
    expect(keys(offeredToggles(toggles, TABLEWARE_ONLY))).toEqual(['tableware', 'steam'])
    expect(keys(offeredToggles(toggles, PLATING_ONLY))).toEqual(['plating', 'steam'])
  })

  it('offers every toggle unchanged while both are on', () => {
    expect(offeredToggles(toggles, ON)).toBe(toggles)
  })
})

// The dish name is read by both flows, so it stays while either switch is on.
const copyFields = [{ key: 'dish_name', label: '菜名（选填）' }, { key: 'price', label: 'Price' }]

describe('offeredCopyFields', () => {
  it('hides the dish name while both switches are off, keeps every other field', () => {
    expect(keys(offeredCopyFields(copyFields, OFF))).toEqual(['price'])
  })

  it('returns the same array when nothing is hidden or either switch is on', () => {
    expect(offeredCopyFields(copyFields, ON)).toBe(copyFields)
    expect(offeredCopyFields(copyFields, TABLEWARE_ONLY)).toBe(copyFields)
    expect(offeredCopyFields(copyFields, PLATING_ONLY)).toBe(copyFields)
    const plain = copyFields.slice(1)
    expect(offeredCopyFields(plain, OFF)).toBe(plain)
  })
})

describe('offeredTemplate', () => {
  const template = { id: 'food', copyFields, toggles: [] }

  it('drops the dish name from the template while both switches are off, touching nothing else', () => {
    const offered = offeredTemplate(template, OFF)
    expect(offered).toEqual({ ...template, copyFields: [copyFields[1]] })
    expect(template.copyFields).toHaveLength(2)
  })

  it('is the same object while either switch is on or the template has no dish name', () => {
    expect(offeredTemplate(template, ON)).toBe(template)
    expect(offeredTemplate(template, TABLEWARE_ONLY)).toBe(template)
    const plain = { ...template, copyFields: copyFields.slice(1) }
    expect(offeredTemplate(plain, OFF)).toBe(plain)
  })
})

// What the server forces (runGeneration and admin test runs share it).
describe('foodSwitchedOff', () => {
  it('forces off each switched-off toggle and drops the dish name only when both are off', () => {
    expect(foodSwitchedOff(OFF)).toEqual({ forceOff: ['plating', 'tableware'], dropCopy: ['dish_name'] })
    expect(foodSwitchedOff(TABLEWARE_ONLY)).toEqual({ forceOff: ['plating'], dropCopy: [] })
    expect(foodSwitchedOff(PLATING_ONLY)).toEqual({ forceOff: ['tableware'], dropCopy: [] })
    expect(foodSwitchedOff(ON)).toEqual({ forceOff: [], dropCopy: [] })
  })
})
