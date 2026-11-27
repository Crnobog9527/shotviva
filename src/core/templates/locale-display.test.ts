import { describe, expect, it } from 'vitest'

import { applyLocaleDisplay, NO_LOCALE_DISPLAY, orderSiblings, orderTree } from './locale-display'
import type { CategoryNode } from './taxonomy'

const node = (key: string, sortOrder: number, children: CategoryNode[] = []) => ({ key, sortOrder, children }) as CategoryNode
const tpl = (id: string, category: string, sortOrder: number, featuredRank: number | null = null) =>
  ({ id, category, categoryView: { sortOrder, name: category }, featuredRank })

describe('orderSiblings', () => {
  const items = [{ key: 'a', sortOrder: 10 }, { key: 'b', sortOrder: 20 }, { key: 'c', sortOrder: 30 }]

  it('keeps the shared order when nothing is saved', () => {
    expect(orderSiblings(items).map((i) => i.key)).toEqual(['a', 'b', 'c'])
    expect(orderSiblings(items, {}).map((i) => i.key)).toEqual(['a', 'b', 'c'])
  })

  it('follows the saved positions', () => {
    expect(orderSiblings(items, { a: 30, b: 20, c: 10 }).map((i) => i.key)).toEqual(['c', 'b', 'a'])
  })

  it('puts a category added after saving behind the saved ones, in the shared order', () => {
    const more = [...items, { key: 'd', sortOrder: 5 }]
    expect(orderSiblings(more, { c: 10, a: 20, b: 30 }).map((i) => i.key)).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('orderTree', () => {
  const tree = [node('a', 10, [node('a1', 10), node('a2', 20)]), node('b', 20)]

  it('returns the tree untouched without a saved order', () => {
    expect(orderTree(tree, undefined)).toBe(tree)
    expect(orderTree(tree, {})).toBe(tree)
  })

  it('orders every level and leaves the input alone', () => {
    const ordered = orderTree(tree, { b: 10, a: 20, a2: 10, a1: 20 })
    expect(ordered.map((n) => n.key)).toEqual(['b', 'a'])
    expect(ordered[1].children.map((n) => n.key)).toEqual(['a2', 'a1'])
    expect(tree.map((n) => n.key)).toEqual(['a', 'b'])
  })
})

describe('applyLocaleDisplay', () => {
  const live = [tpl('t1', 'chinese', 10, 1), tpl('t2', 'western', 20, 2), tpl('t3', 'western', 20)]

  it('changes nothing for a language with nothing saved', () => {
    expect(applyLocaleDisplay(live, NO_LOCALE_DISPLAY, 'zh').map((t) => [t.categoryView.sortOrder, t.featuredRank]))
      .toEqual([[0, 1], [10, 2], [10, null]])
  })

  it('orders the root categories per language, one language not touching the other', () => {
    const display = { categoryOrder: { en: { western: 10, chinese: 20 } }, featured: {} }
    const en = applyLocaleDisplay(live, display, 'en')
    const zh = applyLocaleDisplay(live, display, 'zh')
    expect(en.find((t) => t.id === 't2')?.categoryView.sortOrder).toBeLessThan(en.find((t) => t.id === 't1')?.categoryView.sortOrder ?? 0)
    expect(zh.find((t) => t.id === 't1')?.categoryView.sortOrder).toBeLessThan(zh.find((t) => t.id === 't2')?.categoryView.sortOrder ?? 0)
  })

  it("uses the language's own featured list, dropping the shared ranks", () => {
    const display = { categoryOrder: {}, featured: { en: ['t3', 't2'] } }
    expect(applyLocaleDisplay(live, display, 'en').map((t) => [t.id, t.featuredRank])).toEqual([['t1', null], ['t2', 2], ['t3', 1]])
    expect(applyLocaleDisplay(live, display, 'zh').map((t) => t.featuredRank)).toEqual([1, 2, null])
  })

  it('treats an empty own list as following the shared one', () => {
    expect(applyLocaleDisplay(live, { categoryOrder: {}, featured: { en: [] } }, 'en').map((t) => t.featuredRank)).toEqual([1, 2, null])
  })

  it('does not mutate the catalogue it was given', () => {
    applyLocaleDisplay(live, { categoryOrder: { en: { western: 1 } }, featured: { en: ['t3'] } }, 'en')
    expect(live[0].featuredRank).toBe(1)
    expect(live[0].categoryView.sortOrder).toBe(10)
  })
})
