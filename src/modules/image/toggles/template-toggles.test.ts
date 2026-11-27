import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { foodSwitchedOff } from '@/core/templates/food-toggle-keys'
import { FoodTogglesProvider } from '@/core/templates/offered-toggles'

import { TemplateToggles } from './template-toggles'

// 2009: the workspace, the creation dialog and batch create all draw toggles through this one.
const template = { id: 'food-a', toggles: [{ key: 'plating', label: 'Upgrade plating' }, { key: 'tableware', label: 'Upgrade tableware' }] }
const props = { template, values: {}, onChange: () => {}, surface: 'workspace' as const, className: 'wrap' }

function html(switches: { plating: boolean; tableware: boolean } | null) {
  const toggles = createElement(TemplateToggles, props)
  return renderToStaticMarkup(switches === null ? toggles : createElement(FoodTogglesProvider, { offer: foodSwitchedOff(switches) }, toggles))
}

describe('TemplateToggles and the food switches', () => {
  it('draws nothing for 优化摆盘 / 优化器皿 while both switches are off, or with no provider', () => {
    expect(html({ plating: false, tableware: false })).toBe('')
    expect(html(null)).toBe('')
  })

  it('draws only 优化器皿 while only its switch is on', () => {
    const tablewareOnly = html({ plating: false, tableware: true })
    expect(tablewareOnly).toContain('Upgrade tableware')
    expect(tablewareOnly).not.toContain('Upgrade plating')
  })

  it('draws both as before while both are on', () => {
    const on = html({ plating: true, tableware: true })
    expect(on).toContain('Upgrade plating')
    expect(on).toContain('Upgrade tableware')
  })
})
