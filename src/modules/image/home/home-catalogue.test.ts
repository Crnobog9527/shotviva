import { describe, expect, it } from 'vitest'

import type { LocalizedTemplate } from '@/core/templates'

import { HOME_CATALOGUE_CACHE_CONTROL, homePanelTemplates } from './home-catalogue'

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

  it('follows the featured order (featured_rank), skipping slot templates, and fills from catalogue order', () => {
    const ranked = (id: string, rank: number, slot = false) => ({ ...template(id, slot), featuredRank: rank })
    const live = [template('one'), template('two'), ranked('lobby', 0), ranked('slot-featured', 1, true), ranked('dish', 2), template('three')]
    const { templates, opening } = homePanelTemplates(live, 'lobby')
    expect(templates.map(({ id }) => id)).toEqual(['lobby', 'dish', 'one', 'two'])
    expect(opening?.id).toBe('lobby')
    const many = [template('one'), ranked('d', 3), ranked('a', 0), ranked('c', 2), ranked('b', 1), ranked('e', 4)]
    expect(homePanelTemplates(many, 'a').templates.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd'])
    // A default outside the rail (an experiment's template) still joins it.
    expect(homePanelTemplates(many, 'one').templates.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd', 'one'])
  })

  it('takes 精选组合 templates after the featured ones and before the rest, once each', () => {
    const live = [template('one'), template('two'), { ...template('lobby'), featuredRank: 0 }, template('cake'), template('slot', true)]
    const { templates } = homePanelTemplates(live, 'lobby', ['cake', 'lobby', 'slot', 'gone'])
    expect(templates.map(({ id }) => id)).toEqual(['lobby', 'cake', 'one', 'two'])
  })

  it('falls back to the first usable template when the default is a slot template or is missing', () => {
    for (const defaultId of ['slot', 'missing', null]) {
      const { templates, opening } = homePanelTemplates(catalogue, defaultId)
      expect(templates.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four'])
      expect(opening?.id).toBe('one')
    }
    expect(homePanelTemplates([], null)).toEqual({ templates: [], opening: undefined })
  })

  it('leaves the workspace form out of the page: required text fields keep only their key facts', () => {
    const withCopy = template('copy')
    withCopy.fields.copy = [
      { key: 'headline', label: 'Headline', type: 'short', required: true, maxLength: 40, placeholder: 'Grand opening', help: 'Shown large', example: 'Open now', public: false },
      { key: 'size', label: 'Size', type: 'select', required: false, maxLength: 20, options: ['S', 'M'], public: false },
    ]
    withCopy.fields.groups = [{ key: 'text', label: 'Text', open: true, items: ['headline', 'size'] }]
    const [panel] = homePanelTemplates([withCopy], 'copy').templates
    expect(panel?.copyFields).toEqual([
      { key: 'headline', label: 'Headline', type: 'short', required: true, maxLength: 40, public: false },
      { key: 'size', label: 'Size', type: 'select', required: false, maxLength: 20, public: false },
    ])
    expect(panel).not.toHaveProperty('groups')
  })
})

describe('home picker catalogue response', () => {
  // The route test pins the header it sends; this pins the value: shared caches only, briefly.
  it('is public for the CDN for a minute, and never fresh in the browser', () => {
    expect(HOME_CATALOGUE_CACHE_CONTROL).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=60')
  })
})

