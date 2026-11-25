import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
const { readFeaturedBundles, readLocaleDisplay } = await import('./locale-display-read')

// A fake client: each table answers range() with the slice of its rows, like PostgREST.
function client(tables: Record<string, unknown[]>, max = 500) {
  return {
    from: (table: string) => {
      const query = {
        select: () => query, order: () => query, returns: () => query,
        range: (from: number, to: number) => ({ ...query, returns: async () => ({ data: (tables[table] ?? []).slice(from, Math.min(to + 1, from + max)), error: null }) }),
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

  it('reads 精选组合 apart, with their templates in order and each language\'s own bundles', async () => {
    const bundles = await readFeaturedBundles(client({
      featured_bundles: [{ id: 'b1', name_en: 'Brunch', name_zh: '早午餐', featured_rank: 1 }, { id: 'b2', name_en: 'Sweets', name_zh: '甜点', featured_rank: null }],
      featured_bundle_items: [{ bundle_id: 'b1', template_id: 'y', position: 2 }, { bundle_id: 'b1', template_id: 'x', position: 1 }, { bundle_id: 'b2', template_id: 'z', position: 1 }],
      bundle_featured_locale: [{ locale: 'zh', bundle_id: 'b2', rank: 1 }],
    }))
    expect(bundles).toEqual({
      list: [
        { id: 'b1', nameEn: 'Brunch', nameZh: '早午餐', featuredRank: 1, templateIds: ['x', 'y'] },
        { id: 'b2', nameEn: 'Sweets', nameZh: '甜点', featuredRank: null, templateIds: ['z'] },
      ],
      locale: { zh: ['b2'] },
    })
  })

  it('never reads the bundle tables for the catalogue, and a failed bundle read gives none instead of throwing', async () => {
    const read: string[] = []
    const spy = { from: (table: string) => { read.push(table); return (client({}) as unknown as { from: (t: string) => unknown }).from(table) } } as never
    await readLocaleDisplay(spy)
    expect(read.sort()).toEqual(['template_category_locale_order', 'template_featured_locale'])
    const broken = { from: () => { const q = { select: () => q, order: () => q, returns: () => q, range: () => ({ returns: async () => ({ data: null, error: { code: '57014', message: 'timeout' } }) }) }; return q } } as never
    await expect(readFeaturedBundles(broken)).resolves.toBeUndefined()
  })

  it('follows the shared order while the tables do not exist yet', async () => {
    const missing = { from: () => { const q = { select: () => q, order: () => q, returns: () => q, range: () => ({ returns: async () => ({ data: null, error: { code: '42P01', message: 'x' } }) }) }; return q } } as never
    await expect(readLocaleDisplay(missing)).resolves.toEqual({ categoryOrder: {}, featured: {} })
  })
})
