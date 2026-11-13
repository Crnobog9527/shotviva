import { describe, expect, it } from 'vitest'

import { buildSearchIndex, normalizeQuery, searchTemplates } from './catalogue-search'
import type { CatalogueTemplate } from './catalogue-template'
import type { FilterNode, GridEntry } from './catalogue-view'

const template = (id: string, name: string, description: string | null = null) =>
  ({ id, name, description, category: 'x', categoryName: '餐饮' }) as CatalogueTemplate

const filters: FilterNode[] = [{ slug: 'food', name: '餐饮', alias: 'Food & Drink', children: [{ slug: 'menu', name: '菜单', alias: 'Menus', children: [] }] }]
const menu = template('m1', '中式菜单', '一张图做好整页菜单')
const anime = template('a1', '日漫风', 'Anime look')
const poster = template('p1', '促销海报')
const entries: GridEntry[] = [
  { type: 'template', template: poster, path: ['food'] },
  { type: 'series', path: ['food', 'menu'], series: { id: 's', slug: 's', name: '菜单系列', description: 'Restaurant menus', cover: null, categoryName: '菜单', members: [menu] } },
  { type: 'template', template: anime, path: [] },
  // The same template twice (also listed on its own): one result.
  { type: 'template', template: menu, path: ['food', 'menu'] },
]
const index = buildSearchIndex(entries, filters)
const ids = (query: string) => searchTemplates(index, query).map((found) => found.id)

describe('template search', () => {
  it('matches names, descriptions, category paths in both languages and series names', () => {
    expect(ids('菜单')).toEqual(['m1'])
    expect(ids('anime')).toEqual(['a1'])
    expect(ids('food')).toEqual(['p1', 'm1'])
    expect(ids('MENUS')).toEqual(['m1'])
    expect(ids('restaurant')).toEqual(['m1'])
  })

  it('needs every word, ignores case, full-width forms and spaces, and puts name matches first', () => {
    expect(ids('  ａｎｉｍｅ  ')).toEqual(['a1'])
    expect(ids('food 菜单')).toEqual(['m1'])
    expect(ids('food anime')).toEqual([])
    expect(ids('餐饮')).toEqual(['p1', 'm1', 'a1'])
    expect(ids('')).toEqual([])
    expect(normalizeQuery(' A  B ')).toBe('a b')
  })
})
