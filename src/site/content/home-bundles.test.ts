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
      name: 'Featured sets', intro: expect.stringContaining('all 4 templates'),
      templates: [{
        id: 'bundle-b1', name: 'Weekend', use: '',
        bundle: {
          members: ['cake', 'steak'], templates: [{ id: 'cake', name: 'cake name' }, { id: 'fries', name: 'fries name' }, { id: 'steak', name: 'steak name' }],
          // No category index here: the way on is every template, counted live.
          more: { name: null, count: 4, path: [] },
        },
      }],
    })
    expect(Object.keys(media)).toEqual(['cake', 'steak', 'soup'])
  })

  it('shows no group without a bundle to show, and names it in Chinese on /zh', () => {
    expect(bundleSection(catalogue, [], 'en').category).toBeNull()
    const zh = bundleSection(catalogue, [{ id: 'b', name: '组合', memberIds: ['cake', 'steak'] }], 'zh').category
    expect(zh?.name).toBe('精选组合')
    // The whole catalogue's live size, so a card's few templates read as a pick from many.
    expect(zh?.intro).toContain('从全站 4 个模板里')
  })

  it('gives the later pairs in the card\'s order, each with its template', () => {
    expect(bundleLayerPairs(catalogue, [{ id: 'b1', name: 'W', memberIds: ['cake', 'fries', 'steak', 'soup'] }]))
      .toEqual({ 'bundle-b1': [['/b/steak.webp', '/a/steak.webp', 'steak'], ['/b/soup.webp', '/a/soup.webp', 'soup']] })
  })
})
