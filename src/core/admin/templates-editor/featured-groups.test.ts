import { describe, expect, it } from 'vitest'

import { featuredGroups, sameMembers, withGroupOrder } from './featured-groups'

const category = (key: string, sortOrder: number) => ({ key, nameZh: `中${key}`, nameEn: key, introEn: null, introZh: null, cardStyle: 'pair' as const, sortOrder, isSystem: false })
const t = (id: string, key: string, sortOrder: number) => [id, { id, category: key, categoryInfo: category(key, sortOrder) }] as const
const byId = new Map([t('a', 'food', 2), t('b', 'style', 1), t('c', 'food', 2), t('d', 'pets', 3), t('e', 'style', 1)])

describe('featuredGroups (the home page grouping)', () => {
  it('groups by root category in 分类管理 order, featured order inside a group', () => {
    expect(featuredGroups(['a', 'b', 'c', 'd', 'e'], byId)).toEqual([
      { key: 'style', nameZh: '中style', nameEn: 'style', ids: ['b', 'e'] },
      { key: 'food', nameZh: '中food', nameEn: 'food', ids: ['a', 'c'] },
      { key: 'pets', nameZh: '中pets', nameEn: 'pets', ids: ['d'] },
    ])
  })

  it('keeps categories with the same position in the order they first appear, and skips unknown ids', () => {
    const tied = new Map([t('x', 'one', 1), t('y', 'two', 1)])
    expect(featuredGroups(['y', 'ghost', 'x'], tied).map((group) => group.key)).toEqual(['two', 'one'])
  })
})

describe('withGroupOrder', () => {
  it('saves the groups in page order, so the first card is rank 1', () => {
    const groups = featuredGroups(['a', 'b', 'c', 'd', 'e'], byId)
    expect(withGroupOrder(groups, 'food', ['c', 'a'])).toEqual(['b', 'e', 'c', 'a', 'd'])
  })
})

describe('sameMembers', () => {
  it('ignores order but not membership', () => {
    expect(sameMembers(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameMembers(['a', 'b'], ['a'])).toBe(false)
  })
})
