import { describe, expect, it } from 'vitest'

import type { CategoryNode } from '@/core/templates/taxonomy'

import { bundleMore, placements } from './bundle-reach'

const node = (key: string, path: string[], nameZh: string, children: CategoryNode[] = []) =>
  ({ key, slug: path.at(-1), path, nameEn: key, nameZh, children }) as unknown as CategoryNode

// 餐饮 › 中餐 › 热菜, 餐饮 › 西餐, 酒店
const tree = [
  node('food', ['food'], '餐饮', [node('cn', ['food', 'cn'], '中餐', [node('cn-hot', ['food', 'cn', 'hot'], '热菜')]), node('west', ['food', 'west'], '西餐')]),
  node('hotel', ['hotel'], '酒店'),
]
const index = {
  tree,
  entries: [
    { type: 'template' as const, id: 'mapo', categoryKey: 'cn-hot' },
    { type: 'template' as const, id: 'dumpling', categoryKey: 'cn' },
    { type: 'series' as const, id: 's-hot', categoryKey: 'cn-hot' },
    { type: 'template' as const, id: 'steak', categoryKey: 'west' },
    { type: 'template' as const, id: 'lobby', categoryKey: 'hotel' },
    { type: 'template' as const, id: 'gone', categoryKey: 'hotel' },
  ],
  series: [{ id: 's-hot', slug: 'hot', name: 'Hot', description: null, coverUrl: null, memberIds: ['kungpao', 'gone'] }],
}
const live = new Set(['mapo', 'dumpling', 'kungpao', 'steak', 'lobby', 'unplaced'])
const placed = placements(index, live)

describe('a bundle card\'s way to the rest of the catalogue', () => {
  it('places live templates only, series members through their series', () => {
    expect([...placed.keys()].sort()).toEqual(['dumpling', 'kungpao', 'lobby', 'mapo', 'steak'])
  })

  it('names the deepest category every member shares, with its live count and browse path', () => {
    expect(bundleMore(['mapo', 'kungpao'], placed, 6, 'zh')).toEqual({ name: '热菜', count: 2, path: ['food', 'cn', 'hot'] })
    expect(bundleMore(['mapo', 'dumpling'], placed, 6, 'zh')).toEqual({ name: '中餐', count: 3, path: ['food', 'cn'] })
    expect(bundleMore(['mapo', 'steak'], placed, 6, 'en')).toEqual({ name: 'food', count: 4, path: ['food'] })
  })

  it('offers every template when the members share no category, or one is not placed', () => {
    expect(bundleMore(['mapo', 'lobby'], placed, 6, 'zh')).toEqual({ name: null, count: 6, path: [] })
    expect(bundleMore(['mapo', 'unplaced'], placed, 6, 'zh')).toEqual({ name: null, count: 6, path: [] })
    // The index failed to read: nothing is placed.
    expect(bundleMore(['mapo', 'dumpling'], new Map(), 6, 'en')).toEqual({ name: null, count: 6, path: [] })
  })
})
