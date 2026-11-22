import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FoodTogglesProvider } from '@/core/templates/offered-toggles'

import { TemplateToggles } from './template-toggles'

// 1848: the workspace, the creation dialog and batch create all draw toggles through this one.
const template = { id: 'food-a', toggles: [{ key: 'plating', label: 'Upgrade plating' }, { key: 'tableware', label: 'Upgrade tableware' }] }
const props = { template, values: {}, onChange: () => {}, surface: 'workspace' as const, className: 'wrap' }

function html(enabled: boolean | null) {
  const toggles = createElement(TemplateToggles, props)
  return renderToStaticMarkup(enabled === null ? toggles : createElement(FoodTogglesProvider, { enabled }, toggles))
}

describe('TemplateToggles and the food switch', () => {
  it('draws nothing for 优化摆盘 / 优化器皿 while the switch is off, or with no provider', () => {
    expect(html(false)).toBe('')
    expect(html(null)).toBe('')
  })

  it('draws both as before while it is on', () => {
    const on = html(true)
    expect(on).toContain('Upgrade plating')
    expect(on).toContain('Upgrade tableware')
  })
})
