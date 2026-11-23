import { describe, expect, it } from 'vitest'

import { offeredCopyFields, offeredTemplate, offeredToggles } from './offered-toggles'

// 1848: the food templates' 优化摆盘 / 优化器皿 are offered only while the site-wide switch is on.
const toggles = [{ key: 'plating', label: 'Plating' }, { key: 'tableware', label: 'Tableware' }, { key: 'steam', label: 'Steam' }]

describe('offeredToggles', () => {
  it('hides plating and tableware while the switch is off, keeps any other toggle', () => {
    expect(offeredToggles(toggles, false).map((toggle) => toggle.key)).toEqual(['steam'])
    expect(offeredToggles(toggles.slice(0, 2), false)).toEqual([])
  })

  it('offers every toggle unchanged while it is on', () => {
    expect(offeredToggles(toggles, true)).toBe(toggles)
  })
})

// The dish name is read only by the toggle flows, so it goes with them while the switch is off.
const copyFields = [{ key: 'dish_name', label: '菜名（选填）' }, { key: 'price', label: 'Price' }]

describe('offeredCopyFields', () => {
  it('hides the dish name while the switch is off, keeps every other field', () => {
    expect(offeredCopyFields(copyFields, false).map((field) => field.key)).toEqual(['price'])
  })

  it('returns the same array when nothing is hidden or the switch is on', () => {
    expect(offeredCopyFields(copyFields, true)).toBe(copyFields)
    const plain = copyFields.slice(1)
    expect(offeredCopyFields(plain, false)).toBe(plain)
  })
})

describe('offeredTemplate', () => {
  const template = { id: 'food', copyFields, toggles: [] }

  it('drops the dish name from the template while the switch is off, touching nothing else', () => {
    const offered = offeredTemplate(template, false)
    expect(offered).toEqual({ ...template, copyFields: [copyFields[1]] })
    expect(template.copyFields).toHaveLength(2)
  })

  it('is the same object while the switch is on or the template has no dish name', () => {
    expect(offeredTemplate(template, true)).toBe(template)
    const plain = { ...template, copyFields: copyFields.slice(1) }
    expect(offeredTemplate(plain, false)).toBe(plain)
  })
})
