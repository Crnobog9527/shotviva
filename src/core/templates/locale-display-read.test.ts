import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { readLocaleDisplay } = await import('./locale-display-read')

// A fake client: each table answers range() with the slice of its rows, like PostgREST.
function client(tables: Record<string, unknown[]>, max = 500) {
  return {
    from: (table: string) => {
      const query = {
        select: () => query, order: () => query, returns: () => query,
        range: (from: number, to: number) => ({ ...query, returns: async () => ({ data: tables[table].slice(from, Math.min(to + 1, from + max)), error: null }) }),
      }
      return query
    },
  } as never
}

describe('readLocaleDisplay', () => {
  it('reads every page of both tables, so a long featured list is not cut', async () => {
    const featured = Array.from({ length: 1200 }, (_, i) => ({ locale: 'zh', template_id: `t${i}`, rank: i + 1 }))
    const display = await readLocaleDisplay(client({ template_category_locale_order: [{ locale: 'en', category_key: 'a', sort_order: 10 }], template_featured_locale: featured }))
    expect(display.featured.zh).toHaveLength(1200)
    expect(display.featured.zh?.[1199]).toBe('t1199')
    expect(display.categoryOrder.en).toEqual({ a: 10 })
  })

  it('follows the shared order while the tables do not exist yet', async () => {
    const missing = { from: () => { const q = { select: () => q, order: () => q, returns: () => q, range: () => ({ returns: async () => ({ data: null, error: { code: '42P01', message: 'x' } }) }) }; return q } } as never
    await expect(readLocaleDisplay(missing)).resolves.toEqual({ categoryOrder: {}, featured: {} })
  })
})
