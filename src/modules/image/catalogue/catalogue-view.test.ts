import { describe, expect, it } from 'vitest'

import type { CatalogueIndex, CategoryNode } from '@/core/templates'

import type { CatalogueTemplate } from './catalogue-template'
import { buildCatalogueView, findSeries } from './catalogue-view'

function category(key: string, path: string[], children: CategoryNode[] = []): CategoryNode {
  const intro = key === 'food' ? { introEn: 'Dishes', introZh: '菜品' } : { introEn: null, introZh: null }
  return { key, nameEn: `${key} en`, nameZh: `${key} 中`, ...intro, slug: path.at(-1) as string, path, level: path.length, children } as CategoryNode
}

const tree = [
  category('food', ['food'], [category('food-dark', ['food', 'dark'], [category('food-dark-cn', ['food', 'dark', 'chinese'])]), category('food-empty', ['food', 'empty'])]),
  category('pets', ['pets']),
  category('art', ['art']),
]
const template = (id: string, cat = 'food', more: Partial<CatalogueTemplate> = {}) =>
  ({ id, name: id, category: cat, categoryName: cat, categoryOrder: 0, cover: { type: 'image', before: 'b', after: 'a', motion: null, poster: null }, ...more }) as CatalogueTemplate

const index: CatalogueIndex = {
  tree,
  entries: [
    { type: 'series', id: 's1', categoryKey: 'food-dark' },
    { type: 'template', id: 't1', categoryKey: 'food-dark-cn' },
    { type: 'template', id: 't2', categoryKey: 'pets' },
    // Not in the visible tree (hidden or system): dropped.
    { type: 'template', id: 't3', categoryKey: 'edit' },
    // Not readable on this session: dropped.
    { type: 'template', id: 'gone', categoryKey: 'pets' },
    // Every member gone: no empty series card.
    { type: 'series', id: 's2', categoryKey: 'art' },
  ],
  series: [
    { id: 's1', slug: 'menu-set', name: 'Menu set', description: null, coverUrl: null, memberIds: ['m2', 'missing', 'm1'] },
    { id: 's2', slug: 'gone-set', name: 'Gone', description: null, coverUrl: 'cover.webp', memberIds: ['missing'] },
  ],
}
const templates = [template('t1'), template('t2', 'pets'), template('t3', 'edit'), template('m1'), template('m2')]

describe('Create grid entries (T102)', () => {
  const view = buildCatalogueView(index, templates, false)

  it('keeps the index order and places each card under its category path', () => {
    expect(view.entries.map((entry) => [entry.type, entry.type === 'series' ? entry.series.id : entry.template.id, entry.path.join('/')])).toEqual([
      ['series', 's1', 'food/dark'],
      ['template', 't1', 'food/dark/chinese'],
      ['template', 't2', 'pets'],
    ])
  })

  it('gives a series its readable members in series order, its category name and no own cover', () => {
    const [first] = view.entries
    expect(first?.type === 'series' && first.series).toMatchObject({ slug: 'menu-set', cover: null, categoryName: 'food-dark en' })
    expect(first?.type === 'series' && first.series.members.map((m) => m.id)).toEqual(['m2', 'm1'])
    expect(buildCatalogueView(index, templates, true).entries[0]).toMatchObject({ series: { categoryName: 'food-dark 中' } })
  })

  it('shows only category branches that hold a card, in the page language', () => {
    const leaf = { slug: 'chinese', key: 'food-dark-cn', name: 'food-dark-cn en', intro: null, children: [] }
    expect(view.filters).toEqual([
      { slug: 'food', key: 'food', name: 'food en', intro: 'Dishes', children: [{ slug: 'dark', key: 'food-dark', name: 'food-dark en', intro: null, children: [leaf] }] },
      { slug: 'pets', key: 'pets', name: 'pets en', intro: null, children: [] },
    ])
    expect(buildCatalogueView(index, templates, true).filters[0]).toMatchObject({ name: 'food 中', intro: '菜品' })
  })

  it('falls back to the flat list by root category when the index read failed', () => {
    const flat = buildCatalogueView(null, [template('t1'), template('t2', 'pets')], false)
    expect(flat.filters.map((f) => f.slug)).toEqual(['food', 'pets'])
    expect(flat.entries.map((entry) => entry.path)).toEqual([['food'], ['pets']])
  })

  it('opens ?series= by slug or id, and nothing for anything else', () => {
    expect(findSeries(view.entries, 'menu-set')?.id).toBe('s1')
    expect(findSeries(view.entries, 's1')?.slug).toBe('menu-set')
    expect(findSeries(view.entries, 'gone-set')).toBeNull()
    expect(findSeries(view.entries, null)).toBeNull()
  })
})
