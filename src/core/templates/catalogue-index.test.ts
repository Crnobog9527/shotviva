import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))
const listTemplatesIn = vi.fn(async () => [])
vi.mock('./list-templates', () => ({ listTemplatesIn }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { CATALOGUE_LIFE, readCatalogue } = await import('./cached-catalogue')
const { catalogueIndexOrNull } = await import('./cached-taxonomy')
const { toCatalogueIndex } = await import('./catalogue-index')

const series = (id: string, slug: string) => ({ id, slug, name_en: `${slug} en`, name_zh: `${slug} 中`, description_en: null, description_zh: '说明', cover_url: null })

describe('catalogue index (T102)', () => {
  const entries = [
    { type: 'series' as const, entry_key: 'series-s1', sort_order: 0, category_key: 'food-dark', template_id: null, series_id: 's1', entry_series: series('s1', 'menu-set') },
    { type: 'template' as const, entry_key: 'template-t1', sort_order: 10, category_key: 'pets', template_id: 't1', series_id: null, entry_series: null },
  ]
  const members = [
    { id: 'm2', series_id: 's1', series_sort_order: 20 },
    { id: 'm1', series_id: 's1', series_sort_order: 10 },
    { id: 'm0', series_id: 's1', series_sort_order: 20 },
  ]

  it('keeps the entry order and puts each series member in series order', () => {
    const index = toCatalogueIndex([], entries, members, 'en')
    expect(index.entries).toEqual([
      { type: 'series', id: 's1', categoryKey: 'food-dark' },
      { type: 'template', id: 't1', categoryKey: 'pets' },
    ])
    expect(index.series).toEqual([{ id: 's1', slug: 'menu-set', name: 'menu-set en', description: null, coverUrl: null, memberIds: ['m1', 'm0', 'm2'] }])
  })

  it('names the series in the page language', () => {
    expect(toCatalogueIndex([], entries, members, 'zh').series[0]).toMatchObject({ name: 'menu-set 中', description: '说明' })
  })
})

describe('cached catalogue index', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  it('keeps a good read for the catalogue lifetime', async () => {
    const index = { tree: [], entries: [], series: [] }
    await expect(catalogueIndexOrNull('en', async () => index)).resolves.toBe(index)
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(CATALOGUE_LIFE)
  })

  it('turns a failed read into null for a minute, so Create falls back to its flat list', async () => {
    await expect(catalogueIndexOrNull('en', async () => Promise.reject(new Error('relation web_catalogue_entries does not exist')))).resolves.toBeNull()
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(FAILED_READ_LIFE)
    expect(logger.error).toHaveBeenCalledWith('templates.catalogue_index_failed', expect.anything())
  })
})

// Pages that look a template up by id or price the catalogue must see series members too.
describe('web catalogue for marketing pages', () => {
  it('reads every live web template, series members included', async () => {
    await readCatalogue('zh')
    expect(listTemplatesIn).toHaveBeenCalledWith(expect.anything(), 'zh', { includeSeriesMembers: true })
  })
})
