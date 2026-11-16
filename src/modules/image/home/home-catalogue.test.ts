import { describe, expect, it } from 'vitest'

import type { LocalizedTemplate } from '@/core/templates'

import { homePanelTemplates } from './home-catalogue'

function template(id: string, slot = false): LocalizedTemplate {
  return {
    id,
    name: id,
    fields: { images: { min: 1, max: 1, ...(slot ? { slots: [{ key: 'photo', label: 'Photo', required: true }] } : {}) }, copy: [] },
    categoryInfo: {},
    categoryView: {},
  } as LocalizedTemplate
}

const catalogue = [template('slot', true), ...['one', 'two', 'three', 'four', 'featured', 'deferred'].map((id) => template(id))]

describe('homePanelTemplates', () => {
  it('keeps catalogue order and includes an out-of-rail default for the experiment or featured pick', () => {
    const { templates, opening } = homePanelTemplates(catalogue, 'featured')
    expect(templates.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four', 'featured'])
    expect(opening?.id).toBe('featured')
  })

  it('falls back to the first usable template when the default is a slot template or is missing', () => {
    for (const defaultId of ['slot', 'missing', null]) {
      const { templates, opening } = homePanelTemplates(catalogue, defaultId)
      expect(templates.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four'])
      expect(opening?.id).toBe('one')
    }
    expect(homePanelTemplates([], null)).toEqual({ templates: [], opening: undefined })
  })
})
