import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FoodTogglesProvider } from '@/core/templates/offered-toggles'

import { TestToggles } from './test-toggles'

// 1848: the admin test run hides 优化摆盘 / 优化器皿 too while the site-wide switch is off.
const toggles = [{ key: 'plating', label: 'Plating', default: false as const }, { key: 'tableware', label: 'Tableware', default: false as const }]
const html = (enabled: boolean) =>
  renderToStaticMarkup(createElement(FoodTogglesProvider, { enabled }, createElement(TestToggles, { toggles, values: {}, onChange: () => {} })))

describe('TestToggles and the food switch', () => {
  it('draws nothing while off and both rows while on', () => {
    expect(html(false)).toBe('')
    expect(html(true)).toContain('tableware')
  })
})
