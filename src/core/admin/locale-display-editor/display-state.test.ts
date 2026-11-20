import { describe, expect, it } from 'vitest'

import { addable, featuredState, siblingGroups } from './display-state'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'

const cat = (key: string, parentId: string | null, sortOrder: number) =>
  ({ key, parentId, sortOrder, nameZh: key, nameEn: key, level: parentId ? 2 : 1 }) as AdminCategoryNode
const tpl = (id: string, extra: Partial<AdminTemplate> = {}) =>
  ({ id, isActive: true, visibleIn: ['web'], featuredRank: null, ...extra }) as AdminTemplate
const none = { categoryOrder: {}, featured: {} }

describe('siblingGroups', () => {
  const categories = [cat('a', null, 10), cat('b', null, 20), cat('a1', 'a', 10), cat('a2', 'a', 20), cat('only', 'b', 10)]

  it('lists groups of two or more, top level first, in the shared order', () => {
    expect(siblingGroups(categories, none, 'en')).toEqual([
      { parent: null, title: '一级分类', keys: ['a', 'b'], own: false },
      { parent: 'a', title: '「a」下的子分类', keys: ['a1', 'a2'], own: false },
    ])
  })

  it("shows a language's saved order and marks the group as its own", () => {
    const groups = siblingGroups(categories, { categoryOrder: { zh: { b: 10, a: 20 } }, featured: {} }, 'zh')
    expect(groups[0]).toMatchObject({ keys: ['b', 'a'], own: true })
    expect(siblingGroups(categories, { categoryOrder: { zh: { b: 10, a: 20 } }, featured: {} }, 'en')[0]).toMatchObject({ keys: ['a', 'b'], own: false })
  })
})

describe('featuredState', () => {
  const templates = [tpl('a', { featuredRank: 2 }), tpl('b', { featuredRank: 1 }), tpl('c'), tpl('gone', { isActive: false })]

  it('follows the shared list until the language has its own', () => {
    expect(featuredState(templates, none, 'zh')).toEqual({ own: false, ids: ['b', 'a'] })
  })

  it('shows its own list without templates that are no longer published', () => {
    expect(featuredState(templates, { categoryOrder: {}, featured: { zh: ['c', 'gone', 'a'] } }, 'zh')).toEqual({ own: true, ids: ['c', 'a'] })
  })

  it('offers published web templates that are not in the list yet', () => {
    expect(addable(templates, ['a']).map((t) => t.id)).toEqual(['b', 'c'])
    expect(addable([tpl('x', { visibleIn: ['partner'] }), tpl('y', { deletedAt: 'now' })], [])).toEqual([])
  })
})
