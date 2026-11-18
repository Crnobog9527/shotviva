import { expect, it, vi } from 'vitest'

vi.mock('./taxonomy-reads', () => ({ readCategoryTree: async () => [] }))
const { readCatalogueIndex } = await import('./catalogue-index')

type Row = Record<string, unknown>
function client(tables: Record<string, Row[]>, failAt?: { table: string; from: number }) {
  const ranges: Record<string, number[]> = {}
  const db = {
    from(table: string) {
      let start = 0
      let end = 0
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: (from: number, to: number) => { start = from; end = to; return query },
        returns: async () => {
          ;(ranges[table] ??= []).push(start)
          if (table === failAt?.table && start === failAt.from) return { data: null, error: new Error('read failed') }
          return { data: (tables[table] ?? []).slice(start, end + 1), error: null }
        },
      }
      return query
    },
  }
  return { db, ranges }
}

it.each([[501, [0, 500]], [1000, [0, 500, 1000]], [1001, [0, 500, 1000]]])(
  'reads every page of %i sale-checked members', async (count, expectedRanges) => {
  const members = Array.from({ length: count }, (_, i) => ({
    id: `item-${String(i).padStart(4, '0')}`, series_id: null, series_sort_order: 0,
    sort_order: i, category_key: 'food', standalone: true,
  }))
  const { db, ranges } = client({ web_template_members: members, template_series: [], template_category_paths: [] })
  const index = await readCatalogueIndex(db as never, 'en')
  expect(index.entries).toHaveLength(count)
  expect(index.entries[count - 1]).toEqual({ type: 'template', id: `item-${String(count - 1).padStart(4, '0')}`, categoryKey: 'food' })
  expect(ranges.web_template_members).toEqual(expectedRanges)
})

it('does not silently return an incomplete directory if a later page fails', async () => {
  const members = Array.from({ length: 501 }, (_, i) => ({ id: `item-${i}` }))
  const { db } = client({ web_template_members: members }, { table: 'web_template_members', from: 500 })
  await expect(readCatalogueIndex(db as never, 'en')).rejects.toThrow('read failed')
})
