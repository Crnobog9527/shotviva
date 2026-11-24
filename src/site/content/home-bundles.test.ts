import { describe, expect, it } from 'vitest'

import { bundleLayerPairs, bundleSection } from './home-bundles'

const live = (id: string, covers = true) => ({ id, name: `${id} name`, coverBeforeUrl: covers ? `/b/${id}.webp` : null, coverAfterUrl: covers ? `/a/${id}.webp` : null })
const catalogue = [live('steak'), live('cake'), live('fries', false), live('soup')]

describe('精选组合 on the home page', () => {
  it('makes one group ahead of the categories, a card per bundle with two or more live templates', () => {
    const { category, media } = bundleSection(catalogue, [
      { id: 'b1', name: 'Weekend', memberIds: ['cake', 'gone', 'fries', 'steak'] },
      { id: 'b2', name: 'Lonely', memberIds: ['soup', 'gone'] },
    ], 'en')
    expect(category).toEqual({
      name: 'Featured sets', intro: expect.any(String),
      templates: [{
        id: 'bundle-b1', name: 'Weekend', use: '',
        bundle: { members: ['cake', 'steak'], templates: [{ id: 'cake', name: 'cake name' }, { id: 'fries', name: 'fries name' }, { id: 'steak', name: 'steak name' }] },
      }],
    })
    expect(Object.keys(media)).toEqual(['cake', 'steak', 'soup'])
  })

  it('shows no group without a bundle to show, and names it in Chinese on /zh', () => {
    expect(bundleSection(catalogue, [], 'en').category).toBeNull()
    expect(bundleSection(catalogue, [{ id: 'b', name: '组合', memberIds: ['cake', 'steak'] }], 'zh').category?.name).toBe('精选组合')
  })

  it('gives the later pairs in the card\'s order', () => {
    expect(bundleLayerPairs(catalogue, [{ id: 'b1', name: 'W', memberIds: ['cake', 'fries', 'steak', 'soup'] }]))
      .toEqual({ 'bundle-b1': [['/b/steak.webp', '/a/steak.webp'], ['/b/soup.webp', '/a/soup.webp']] })
  })
})
