import { describe, expect, it } from 'vitest'

import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { categoryOptions, NOT_IN_SERIES, pickerResults, seriesShelves } from './picker-filter'

const cat = (key: string, nameZh: string, parentId: string | null, sortOrder: number) =>
  ({ key, nameZh, nameEn: key, parentId, sortOrder, level: 1 }) as AdminCategoryNode
const tpl = (id: string, category: string, zh: string, extra: Partial<AdminTemplate> = {}) =>
  ({ id, name: `${id} en`, category, isActive: true, visibleIn: ['web'], translations: { zh: { name: zh } }, ...extra }) as unknown as AdminTemplate

const categories = [cat('food', '餐饮', null, 10), cat('cn', '中餐', 'food', 10), cat('hotpot', '火锅', 'cn', 10), cat('art', '画风', null, 20)]
const templates = [
  tpl('beef', 'food', '牛肉火锅', { subcategoryKey: 'hotpot' }),
  tpl('dumpling', 'food', '饺子', { subcategoryKey: 'cn' }),
  tpl('manga', 'art', '漫画风'),
  tpl('hidden', 'food', '下架饺子', { isActive: false }),
  tpl('partner', 'food', '合作饺子', { visibleIn: ['partner'] }),
]

describe('featured picker', () => {
  it('lists categories in tree order with their path', () => {
    expect(categoryOptions(categories)).toEqual([
      { key: 'food', label: '餐饮', depth: 0 },
      { key: 'cn', label: '餐饮 › 中餐', depth: 1 },
      { key: 'hotpot', label: '餐饮 › 中餐 › 火锅', depth: 2 },
      { key: 'art', label: '画风', depth: 0 },
    ])
  })

  it('finds a category and everything under it, published web templates only', () => {
    const ids = (category: string | null) => pickerResults(templates, categories, { text: '', category }).map((t) => t.id)
    expect(ids('food')).toEqual(['beef', 'dumpling'])
    expect(ids('hotpot')).toEqual(['beef'])
    expect(ids(null)).toEqual(['beef', 'dumpling', 'manga'])
  })

  it('searches Chinese name, English name and id, every word must match', () => {
    const ids = (text: string) => pickerResults(templates, categories, { text, category: null }).map((t) => t.id)
    expect(ids('饺子')).toEqual(['dumpling'])
    expect(ids('MANGA en')).toEqual(['manga'])
    expect(ids('beef 漫画')).toEqual([])
  })
})

describe('featured picker by series', () => {
  const names = new Map([['s-wood', '木墩锦布'], ['s-rattan', '藤编托盘']])
  const items = [
    tpl('w2', 'food', '白碗', { subcategoryKey: 'cn', seriesId: 's-wood', seriesSortOrder: 2 }),
    tpl('solo', 'food', '单张', { subcategoryKey: 'cn' }),
    tpl('r1', 'food', '砂锅', { subcategoryKey: 'cn', seriesId: 's-rattan', seriesSortOrder: 1 }),
    tpl('w1', 'food', '汤锅', { subcategoryKey: 'cn', seriesId: 's-wood', seriesSortOrder: 1 }),
    tpl('new', 'food', '新系列', { subcategoryKey: 'cn', seriesId: 's-new' }),
  ]
  const run = (query: Partial<Parameters<typeof pickerResults>[2]>) =>
    pickerResults(items, categories, { text: '', category: null, seriesNames: names, ...query })

  it('shelves series in catalogue order, members in series order, loose templates last', () => {
    const shelves = seriesShelves(run({}), names, '不在系列里')
    expect(shelves.map((shelf) => [shelf.name, shelf.templates.map((t) => t.id)])).toEqual([
      ['木墩锦布', ['w1', 'w2']], ['藤编托盘', ['r1']], ['s-new', ['new']], ['不在系列里', ['solo']],
    ])
  })

  it('finds every member by its series name', () => {
    expect(run({ text: '木墩' }).map((t) => t.id)).toEqual(['w2', 'w1'])
  })

  it('opens one series, or the templates in none', () => {
    expect(run({ series: 's-rattan' }).map((t) => t.id)).toEqual(['r1'])
    expect(run({ series: NOT_IN_SERIES }).map((t) => t.id)).toEqual(['solo'])
  })
})
