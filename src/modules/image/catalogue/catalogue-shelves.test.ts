import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from './catalogue-template'
import { categoryNameAt, sameName, seriesNames, shelfMembers, shelveEntries, SHELF_LIMIT } from './catalogue-shelves'
import type { CatalogueSeries, FilterNode, GridEntry } from './catalogue-view'

const template = (id: string) => ({ id, name: id }) as CatalogueTemplate
const series = (id: string, name: string, count = 3): CatalogueSeries =>
  ({ id, slug: `${id}-set`, name, description: null, cover: null, categoryName: name, members: Array.from({ length: count }, (_, i) => template(`${id}-${i}`)) })
const card = (one: CatalogueSeries, path = ['food', 'chinese']): GridEntry => ({ type: 'series', series: one, path })
const loose = (id: string): GridEntry => ({ type: 'template', template: template(id), path: ['food', 'chinese'] })
const ids = (entries: readonly GridEntry[]) => entries.map((entry) => (entry.type === 'series' ? `s:${entry.series.id}` : entry.template.id))

describe('Create category shelves (Owner 2026-11-25)', () => {
  it('turns each series into a shelf and keeps the templates in no series as the grid', () => {
    const dark = series('dark', '中餐 · 暗调质感')
    const wood = series('wood', '中餐 · 暖棕木质')
    const layout = shelveEntries([card(dark), loose('t1'), card(wood), loose('t2')], '中餐')
    expect(layout.shelves.map((one) => one.id)).toEqual(['dark', 'wood'])
    expect(ids(layout.grid)).toEqual(['t1', 't2'])
  })

  it('shows a category holding one series as its plain templates, with no shelf', () => {
    const layout = shelveEntries([card(series('dark', 'Moody', 3))], 'Anything')
    expect(layout.shelves).toEqual([])
    expect(ids(layout.grid)).toEqual(['dark-0', 'dark-1', 'dark-2'])
    expect(layout.grid[0]?.path).toEqual(['food', 'chinese'])
  })

  it('flattens a series whose name only repeats the chosen category, where it stood', () => {
    const same = series('dark', '中餐 · 暗调质感', 2)
    const layout = shelveEntries([loose('t1'), card(same), card(series('wood', 'Wood'))], '中餐暗调质感')
    expect(layout.shelves.map((one) => one.id)).toEqual(['wood'])
    expect(ids(layout.grid)).toEqual(['t1', 'dark-0', 'dark-1'])
  })

  it('keeps every series a shelf on All (no chosen category)', () => {
    expect(shelveEntries([card(series('a', 'A')), card(series('b', 'B'))], null).shelves).toHaveLength(2)
  })

  it('matches names whatever their case, spaces and punctuation', () => {
    expect(sameName('中餐 · 暗调质感', '中餐暗调质感')).toBe(true)
    expect(sameName('Dark & Moody', 'dark moody')).toBe(true)
    expect(sameName('中餐', '中餐暗调质感')).toBe(false)
    expect(sameName('·', '')).toBe(false)
  })

  it('draws at most SHELF_LIMIT templates on a shelf', () => {
    expect(shelfMembers(series('big', 'Big', SHELF_LIMIT + 3))).toHaveLength(SHELF_LIMIT)
  })

  it('names the category a path chooses, and its series for search', () => {
    const filters: FilterNode[] = [{ slug: 'food', name: '餐饮', children: [{ slug: 'chinese', name: '中餐', children: [] }] }]
    expect(categoryNameAt(filters, ['food', 'chinese'])).toBe('中餐')
    expect(categoryNameAt(filters, [])).toBeNull()
    expect(categoryNameAt(filters, ['food', 'nope'])).toBeNull()
    expect(seriesNames([card(series('dark', 'Dark', 1)), loose('t1')])).toEqual(new Map([['dark-0', 'Dark']]))
  })
})
