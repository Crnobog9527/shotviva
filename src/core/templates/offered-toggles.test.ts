import { describe, expect, it } from 'vitest'

import { offeredToggles } from './offered-toggles'

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
