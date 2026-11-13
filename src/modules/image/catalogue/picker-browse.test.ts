import { describe, expect, it } from 'vitest'

import type { CatalogueIndex, CategoryNode } from '@/core/templates'

import type { CatalogueTemplate } from './catalogue-template'
import { browseView, groupEntries, pickerBrowse } from './picker-browse'

const node = (key: string, path: string[], children: CategoryNode[] = []) =>
  ({ key, nameEn: key, nameZh: `${key}中`, introEn: 'intro', introZh: null, slug: path.at(-1), path, level: path.length, children }) as unknown as CategoryNode
const template = (id: string) => ({ id, name: id, category: 'food', categoryName: 'food', cover: {} }) as CatalogueTemplate

const index: CatalogueIndex = {
  tree: [node('food', ['food'], [node('menu', ['food', 'menu'])]), node('art', ['art'])],
  entries: [
    { type: 'template', id: 't1', categoryKey: 'food' },
    { type: 'series', id: 's1', categoryKey: 'menu' },
    { type: 'template', id: 't2', categoryKey: 'art' },
  ],
  series: [{ id: 's1', slug: 'menus', name: 'Menus', description: null, coverUrl: 'c.webp', memberIds: ['m1', 'm2'] }],
}
const all = ['t1', 't2', 'm1', 'm2', 'loose'].map(template)

describe('picker browse', () => {
  it('carries the tree and placements by id, without intros', () => {
    const browse = pickerBrowse(index, all, false)
    expect(browse?.filters[0]).toEqual({ slug: 'food', name: 'food', alias: 'food中', children: [{ slug: 'menu', name: 'menu', alias: 'menu中', children: [] }] })
    expect(browse?.entries[1]).toMatchObject({ type: 'series', series: { id: 's1', cover: 'c.webp', memberIds: ['m1', 'm2'] }, path: ['food', 'menu'] })
    expect(JSON.stringify(browse)).not.toContain('"cover":{}')
    expect(pickerBrowse(null, all, false)).toBeNull()
  })

  it('rebuilds the view over the offered templates, dropping what is not offered and keeping unplaced ones', () => {
    const view = browseView(pickerBrowse(index, all, false), all.filter((item) => item.id !== 'm1' && item.id !== 't2'), false)
    expect(view.entries.map((entry) => (entry.type === 'series' ? entry.series.members.map((m) => m.id).join('+') : entry.template.id))).toEqual(['t1', 'm2', 'loose'])
    expect(browseView(null, all, false).entries).toHaveLength(5)
  })

  it('groups a list by the level under the chosen category, own cards first', () => {
    const view = browseView(pickerBrowse(index, all, false), all, false)
    expect(groupEntries(view.entries, view.filters, []).map((group) => [group.name, group.entries.length])).toEqual([[null, 1], ['food', 2], ['art', 1]])
    const food = view.entries.filter((entry) => entry.path[0] === 'food')
    expect(groupEntries(food, view.filters, ['food']).map((group) => [group.name, group.entries.length])).toEqual([[null, 1], ['menu', 1]])
  })
})
