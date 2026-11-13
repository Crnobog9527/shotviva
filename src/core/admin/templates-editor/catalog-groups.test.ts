import { describe, expect, it } from 'vitest'
import { catalogSections, filterCatalog, SINGLE_TEMPLATES } from './catalog-groups'

const paths = new Map([['leaf', { key: 'leaf', label: '餐饮 / 暗调 / 中餐', path: ['food', 'dark', 'leaf'] }]])
const member = { id: 'a', category: 'food', subcategoryKey: 'leaf', isActive: false, seriesId: 's', seriesSortOrder: 2 }
const earlier = { ...member, id: 'b', isActive: true, seriesSortOrder: 1 }
const single = { ...earlier, id: 'c', seriesId: null, subcategoryKey: null }
const rows = [member, single, earlier]
const options = [{ id: 's', nameZh: '暗调摄影' }]

describe('admin catalogue filters and groups', () => {
  it('filters by ancestor, series and directly assigned root', () => {
    expect(filterCatalog(rows, paths, 'dark', 's')).toEqual([member, earlier])
    expect(filterCatalog(rows, paths, 'leaf', SINGLE_TEMPLATES)).toEqual([])
    expect(filterCatalog(rows, paths, 'food', SINGLE_TEMPLATES)).toEqual([single])
  })

  it('groups both statuses together in member order; singles have their own group', () => {
    const groups = catalogSections(rows, 'all', true, options)
    expect(groups.map(g => [g.id, g.rows.map(t => t.id), g.orderGroup])).toEqual([
      ['s', ['b', 'a'], null], [SINGLE_TEMPLATES, ['c'], null],
    ])
    expect(catalogSections(rows, 'inactive', true, options).map(g => g.rows)).toEqual([[member]])
  })

  it('preserves T104 status sections and catalogue order when grouping is off', () => {
    expect(catalogSections(rows, 'all', false, options).map(g => [g.orderGroup, g.rows]))
      .toEqual([['active', [single, earlier]], ['inactive', [member]]])
  })

  it('shows 已删除 as one plain section, never reorderable', () => {
    expect(catalogSections([member], 'deleted', false, options)).toEqual([{ id: 'deleted', title: null, orderGroup: null, rows: [member] }])
    expect(catalogSections([member], 'deleted', true, options)[0]?.orderGroup).toBeNull()
  })
})
