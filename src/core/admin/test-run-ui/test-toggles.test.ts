import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { foodSwitchedOff } from '@/core/templates/food-toggle-keys'
import { FoodTogglesProvider } from '@/core/templates/offered-toggles'

import { TestToggles } from './test-toggles'

// 2009: the admin test run hides 优化摆盘 / 优化器皿 too while its own site-wide switch is off.
const toggles = [{ key: 'plating', label: 'Plating', default: false as const }, { key: 'tableware', label: 'Tableware', default: false as const }]
const html = (plating: boolean, tableware: boolean) =>
  renderToStaticMarkup(createElement(FoodTogglesProvider, { offer: foodSwitchedOff({ plating, tableware }) }, createElement(TestToggles, { toggles, values: {}, onChange: () => {} })))

describe('TestToggles and the food switches', () => {
  it('draws nothing while both are off, each row with its own switch on', () => {
    expect(html(false, false)).toBe('')
    const tablewareOnly = html(false, true)
    expect(tablewareOnly).toContain('Tableware')
    expect(tablewareOnly).not.toContain('Plating')
    expect(html(true, true)).toContain('Plating')
  })
})
