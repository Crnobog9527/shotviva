import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'
import { searchCatalog } from './catalog-search'

const row = (id: string, extra: Partial<AdminTemplate> = {}) => ({
  id, name: id, category: 'food', subcategoryKey: null, seriesId: null, translations: {},
  categoryInfo: { nameZh: '餐饮', nameEn: 'Food & Drink' }, ...extra,
}) as unknown as AdminTemplate
const labels = {
  paths: new Map([['cn-dark', { label: '餐饮 / 中餐 / 中餐暗调质感' }], ['food', { label: '餐饮' }]]),
  series: new Map([['s1', '中餐 · 暗调质感']]),
}
const rows = [
  row('cn-black-spotlight', { subcategoryKey: 'cn-dark', seriesId: 's1', translations: { zh: { name: '中餐黑底聚光' } } } as Partial<AdminTemplate>),
  row('burger-pop'),
]

describe('searchCatalog', () => {
  it('finds by Chinese name, id, sub-category path and series name, ignoring case and spaces', () => {
    const ids = (q: string) => searchCatalog(rows, q, labels).map(t => t.id)
    expect(ids('黑底')).toEqual(['cn-black-spotlight'])
    expect(ids(' BURGER ')).toEqual(['burger-pop'])
    expect(ids('中餐暗调')).toEqual(['cn-black-spotlight'])
    expect(ids('暗调质感')).toEqual(['cn-black-spotlight'])
    expect(ids('餐饮')).toEqual(['cn-black-spotlight', 'burger-pop'])
    expect(ids('')).toEqual(['cn-black-spotlight', 'burger-pop'])
    expect(ids('pizza')).toEqual([])
  })
})
