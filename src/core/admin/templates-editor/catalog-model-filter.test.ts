import { describe, expect, it } from 'vitest'

import type { AdminTemplate } from '../templates/types'
import { filterCatalog } from './catalog-groups'
import { filterByModel, modelFilterOptions, UNBOUND_MODEL } from './catalog-model-filter'
import { headerState, toggleVisible } from './selection-state'
import { isBulkEditable } from '../templates/bulk-edit-rules'

const OLD = '2e3a4e64-0000-4000-8000-000000000000'
const NEW = '7941b03f-0000-4000-8000-000000000000'
const lines = [
  { id: OLD, label: 'OpenAI 官方', model: 'gpt-image-2', isActive: false },
  { id: NEW, label: 'Openai-image-2.6', model: 'gpt-image-2.6-sunburst', isActive: true },
]
const row = (id: string, providerId: string | null, extra: Partial<AdminTemplate> = {}) => ({
  id, category: 'food', subcategoryKey: null, seriesId: null, isActive: true, categoryInfo: { isSystem: false },
  prompt: { providerId }, ...extra,
}) as unknown as AdminTemplate
const rows = [
  row('a', OLD), row('b', NEW), row('c', OLD, { isActive: false }), row('d', null),
  row('e', OLD, { category: 'portrait' }), row('edit', OLD, { categoryInfo: { isSystem: true } } as Partial<AdminTemplate>),
]

describe('filterByModel', () => {
  it('keeps only rows bound to the chosen line; unbound means no provider; empty means all', () => {
    expect(filterByModel(rows, OLD).map(t => t.id)).toEqual(['a', 'c', 'e', 'edit'])
    expect(filterByModel(rows, UNBOUND_MODEL).map(t => t.id)).toEqual(['d'])
    expect(filterByModel([row('x', null, { prompt: null })], UNBOUND_MODEL).map(t => t.id)).toEqual(['x'])
    expect(filterByModel(rows, '')).toHaveLength(rows.length)
  })

  it('combines with the category filter and the tab, and select-all takes exactly those rows', () => {
    const paths = new Map([['food', { key: 'food', label: '餐饮', path: ['food'] }]])
    const visible = filterCatalog(filterByModel(rows, OLD), paths, 'food', '').filter(t => t.isActive)
    expect(visible.map(t => t.id)).toEqual(['a', 'edit'])
    const picked = toggleVisible(visible.map(t => t.id), new Set(), true)
    expect([...picked]).toEqual(['a', 'edit'])
    expect(headerState(visible.map(t => t.id), picked)).toBe(true)
    // The built-in edit template rides along in the tick but bulk edit still leaves it out.
    expect(visible.filter(t => picked.has(t.id)).filter(isBulkEditable).map(t => t.id)).toEqual(['a'])
  })
})

describe('modelFilterOptions', () => {
  it('lists each bound line with counts, default line first, inactive marked, unbound last', () => {
    expect(modelFilterOptions(rows, lines)).toEqual([
      { value: NEW, label: 'Openai-image-2.6 · gpt-image-2.6-sunburst', count: 1 },
      { value: OLD, label: 'OpenAI 官方 · gpt-image-2（已停用）', count: 4 },
      { value: UNBOUND_MODEL, label: '未绑定（跟随默认线路）', count: 1 },
    ])
  })

  it('names a line missing from the provider list and keeps a chosen line nobody uses any more', () => {
    const stray = 'deadbeef-0000-4000-8000-000000000000'
    expect(modelFilterOptions([row('z', stray)], lines)).toEqual([{ value: stray, label: '未知线路 deadbeef', count: 1 }])
    expect(modelFilterOptions([row('b', NEW)], lines, OLD).map(o => [o.value, o.count])).toEqual([[NEW, 1], [OLD, 0]])
  })
})
