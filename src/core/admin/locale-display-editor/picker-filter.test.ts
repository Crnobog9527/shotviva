import { describe, expect, it } from 'vitest'

import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { categoryOptions, pickerResults } from './picker-filter'

const cat = (key: string, nameZh: string, parentId: string | null, sortOrder: number) =>
  ({ key, nameZh, nameEn: key, parentId, sortOrder, level: 1 }) as AdminCategoryNode
const tpl = (id: string, category: string, zh: string, extra: Partial<AdminTemplate> = {}) =>
  ({ id, name: `${id} en`, category, isActive: true, visibleIn: ['web'], translations: { zh: { name: zh } }, ...extra }) as unknown as AdminTemplate

const categories = [cat('food', '餐饮', null, 10), cat('cn', '中餐', 'food', 10), cat('hotpot', '火锅', 'cn', 10), cat('art', '画风', null, 20)]
const templates = [
  tpl('beef', 'hotpot', '牛肉火锅'),
  tpl('dumpling', 'cn', '饺子'),
  tpl('manga', 'art', '漫画风'),
  tpl('hidden', 'cn', '下架饺子', { isActive: false }),
  tpl('partner', 'cn', '合作饺子', { visibleIn: ['partner'] }),
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
