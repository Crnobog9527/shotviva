import { describe, expect, it } from 'vitest'

import type { LocalizedTemplate } from '@/core/templates'

import { homePanelTemplates } from './home-catalogue'

function template(id: string, slot = false): LocalizedTemplate {
  return {
    id,
    module: 'image',
    name: id,
    description: null,
    category: 'food-drink',
    categoryInfo: { key: 'food-drink', nameEn: 'Food', nameZh: '餐饮', introEn: null, introZh: null, sortOrder: 10, cardStyle: 'pair', isSystem: false },
    categoryView: { key: 'food-drink', name: 'Food', intro: '', compare: false, sortOrder: 10 },
    coverBeforeUrl: null,
    coverAfterUrl: null,
    coverVideoUrl: null,
    coverPosterUrl: null,
    coverMediaType: 'image',
    coverLocales: {},
    fields: {
      images: { min: 1, max: 1, ...(slot ? { slots: [{ key: 'photo', label: 'Photo', required: true }] } : {}) },
      copy: [],
      toggles: [],
      aspectRatios: ['1:1'],
    },
    quality: 'high',
    creditsCost: { '1k': 1, '2k': 1, '4k': 1 },
    sortOrder: 0,
    isActive: true,
    visibleIn: ['web'],
    translations: {},
    featuredRank: null,
    createdAt: '',
    updatedAt: '',
  }
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
